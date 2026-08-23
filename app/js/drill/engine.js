/**
 * The drill engine.
 *
 * One session, any deck, any card type. Everything specific to a deck lives in
 * cards.js `DECKS`; everything specific to a question type lives in the card
 * description and the input widget. This file only knows how to run a queue.
 *
 * The one piece of scheduling that lives here rather than in store.js is the
 * within-session re-test: a card answered wrong is pushed back into the queue a
 * few places later and has to be answered correctly before the session ends.
 * A miss that is never re-attempted teaches nothing except that the session is
 * nearly over, and the second attempt after a short delay is where the memory
 * actually gets laid down.
 */

import { el, fill, screenHead, button, plural, emphasise } from '../dom.js';
import { Amelie, AMELIE_LINES, pickLine } from '../amelie.js';
import { Clip, unlock } from '../audio.js';
import { getSentenceExplanation, saveSentenceExplanation, recordLearnResult, recordLearnSession, todayProgress, recordMistake, clearMistake, goalCards, POINTS, touchStreak, breaksTakenToday, markBreakTaken, breaksEnabled, flagCard } from '../store.js';
import { requestExplanation } from '../sync.js';
import { EXPLAIN_PROMPT_VERSION } from '../anthropic.js';
import { buildCard, GRAMMAR_RULES, joinArticle, taskFor, factsFor, isStructure, explainTarget } from './cards.js';
import { loadGlossary } from '../content.js';
import { hintFor } from './hint.js';
import { topicFor } from '../grammar-guide.js';
import { INPUTS } from './inputs.js';
import { referenceSheet } from './reference-sheet.js';
import { flagButton } from '../flag.js';
import { chimeCorrect, resetChimeStreak } from '../chime.js';
import { BREAKS, dueCheckpoint, renderBreak } from '../breaks.js';

/** How many cards later a missed card comes back. Far enough that it is a
 * retrieval rather than an echo, near enough to still be in the session. */
const RETEST_GAP = 3;

const LINES = {
  correct: ['Right.', 'Yes!', 'Correct.', 'Good.', 'That is it.'],
  wrong: ['Not quite — this one comes back before the end.', 'Close. You will see this again in a moment.'],
  partial: ['Right word, check the accents.', 'That is the word — the spelling needs one more look.'],
  article: ['Right word, wrong article.'],
};

const INSTRUCTION_BY_STRAND = {
  recv: 'Understand it',
  prod: 'Say it',
};

/**
 * A plan entry may name its own `deck` and `pool`, which is what lets one
 * session mix vocabulary, verbs and phrases: the learner meets "the next words",
 * and which file they happen to live in stays our problem rather than theirs.
 * A single-deck session just passes `deck` and `pool` once for all of them.
 *
 * @param {object} options
 * @param {HTMLElement} options.root
 * @param {Array<{item: object, strand: string, isNew: boolean, deck?: object, pool?: Array}>} options.plan
 * @param {object} [options.deck] one of cards.js DECKS, when the whole plan shares one
 * @param {Array} [options.pool] the full deck, for distractors
 * @param {Map} options.boxes deck id + strand + item id → box, for choosing card types
 * @param {object} options.settings
 * @param {(hash: string) => void} options.navigate
 * @param {string} options.title
 * @param {string} options.back
 * @param {string} options.again hash to start another session
 */
export function runSession({ root, plan, deck: sessionDeck, pool: sessionPool, boxes, settings, navigate, title, sub, back, again }) {
  /** @type {Array<{item, strand, isNew, retry?: boolean}>} */
  let queue = [...plan];
  let index = 0;
  let correctCount = 0;
  let answeredCount = 0;
  let clip = null;
  /** Cards answered, per deck id — see `recordLearnSession`. A mixed session
   * draws from four decks and the home screen needs to know which. */
  const answeredByDeck = {};

  /**
   * The day's card count when this session opened, and which break checkpoints
   * the day has already offered.
   *
   * The checkpoints are thirds of the *daily* goal, so a session that opens at
   * 9 answered has to know that — measuring within the session would offer both
   * breaks again every time.
   *
   * Awaited before the first card renders rather than raced against it. Read in
   * the background, a fast first answer beat the IndexedDB round trip and the
   * count was still 0 when the crossing was tested, so the break never fired.
   * The wait is one indexed read and happens while the screen is already up.
   */
  let dayBefore = 0;
  let breaksTaken = [];
  let breakPending = null;
  const wantsBreaks = breaksEnabled(settings);
  const breaksReady = wantsBreaks
    ? Promise.all([todayProgress(settings.playerId, { goal: goalCards(settings) }), breaksTakenToday()])
        .then(([progress, taken]) => {
          dayBefore = progress.cards ?? 0;
          breaksTaken = taken;
        })
        .catch(() => {})
    : Promise.resolve();

  // Started once for the whole session. It is built from vocab.json and
  // verbs.json, which content.js has already cached by the time any drill
  // opens, so this resolves in the same tick in practice.
  const glossary = loadGlossary();

  const amelie = new Amelie({ size: 'sm', bubble: true });
  const progressFill = el('div', { class: 'progress__fill', style: { width: '0%' } });
  const body = el('div', { class: 'stack stack--lg' });
  const reference = referenceSheet();

  root.append(
    screenHead({ title, sub, back, trailing: reference.el }),
    el('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Progress' }, progressFill),
    body,
  );

  function destroyClip() {
    if (clip) {
      clip.destroy();
      clip = null;
    }
  }

  function renderCard() {
    destroyClip();
    // A break waiting to be offered takes this slot. It is consumed whether it
    // is played or waved away, so a decline is not re-asked two cards later.
    if (breakPending !== null) {
      const mark = breakPending;
      breakPending = null;
      breaksTaken = [...breaksTaken, mark];
      markBreakTaken(mark).catch(() => {});
      renderBreakOffer(mark);
      return;
    }
    if (index >= queue.length) {
      finish();
      return;
    }

    const entry = queue[index];
    const deck = entry.deck ?? sessionDeck;
    const pool = entry.pool ?? sessionPool;
    const box = boxes.get(`${deck.id}:${entry.strand}:${entry.item.id}`) ?? 0;
    const card = buildCard({ item: entry.item, strand: entry.strand, box, deck, pool });

    // Clear the previous card's feedback. Leaving it up makes Amelie look like
    // she is commenting on a question that has not been answered yet.
    amelie.say(null, 'idle');

    progressFill.style.width = `${(answeredCount / Math.max(queue.length, 1)) * 100}%`;

    const audioId = card.prompt.audioId ?? null;
    if (audioId) clip = new Clip(audioId);

    const hint = hintControl(card);
    const revealed = el('p', { class: 'card__note', style: { marginBlockStart: 'var(--s3)', fontStyle: 'italic' }, hidden: true });
    const feedback = el('p', { class: 'card__note', style: { marginBlockStart: 'var(--s2)' }, hidden: true });
    // The rule behind a missed grammar card. Its own node rather than more
    // text in `feedback`, because it is a different kind of thing: `feedback`
    // is what the answer was, this is why.
    const rule = el('p', { class: 'drill__rule', hidden: true });
    // Offered only once the card is answered: before that it would be a way to
    // read the answer out of the explanation.
    //
    // What there is to explain, and what to call the button, is `explainTarget`'s
    // decision — it is a question about the exercise rather than about the DOM,
    // and three grammar shapes were falling through the sentence lookup here
    // and getting no button at all. See its note in cards.js.
    const target = explainTarget(card, sentenceOf(card, { filled: true }));
    const explain = target
      ? explainButton(settings, {
          id: card.item.id,
          lb: target.lb,
          word: target.word,
          label: target.label,
          en: card.deck.gloss(card.item) ?? null,
          task: taskFor(card),
          facts: factsFor(card),
        })
      : null;
    if (explain) explain.hidden = true;

    // Where the sentence appears if the audio will not play. Its own node
    // above the reveal, because on a listening card this is the *question*
    // arriving late, not the answer.
    const fallback = el('p', { class: 'card__note', style: { marginBlockStart: 'var(--s3)', fontStyle: 'italic' }, hidden: true });
    const player = audioId ? playButton(card, fallback) : null;
    const bail = audioOnly(card) ? skipControl(entry, card, deck) : null;

    const prompt = el(
      'div',
      { class: 'card', style: { textAlign: 'center' } },
      el(
        'div',
        { class: 'row', style: { justifyContent: 'center', gap: 'var(--s2)' } },
        el('span', { class: 'meter__label' }, INSTRUCTION_BY_STRAND[card.strand] ?? ''),
        entry.retry ? el('span', { class: 'chip' }, 'again') : null,
      ),
      card.cue ? el('p', { class: 'cue', 'aria-hidden': 'true' }, card.cue) : null,
      teachBefore(card),
      ...promptBody(card),
      player?.el ?? null,
      fallback,
      bail,
      revealed,
      feedback,
      rule,
      explain,
    );

    const inputFactory = INPUTS[card.mode];
    const input = inputFactory(card, (result) => grade(card, entry, result, { revealed, feedback, rule, explain }));

    fill(
      body,
      prompt,
      el('p', { class: 'drill__instruction' }, card.instruction),
      input.el,
      hint,
      amelie.el,
      nextHolder,
      // Last on the card, because it is a footnote about the exercise rather
      // than part of doing it. `deck.id` and `item.id` together are the key
      // the deck's own pool filter looks the flag up by.
      flagButton({
        playerId: settings.playerId,
        source: deck.id,
        id: card.item.id,
        label: flagLabel(card),
      }),
    );
    nextHolder.hidden = true;
    fill(nextHolder, nextButton(entry));

    if (card.mode === 'type' && input.focus) input.focus();
    // Listening cards are useless in silence — play as soon as the card lands,
    // once the first tap of the session has unlocked audio. If that autoplay
    // fails the card has nothing on it at all, so it falls back to the text
    // immediately rather than waiting for a tap that may also fail.
    if (card.type === 'listen' && clip) {
      clip.play().then((ok) => {
        if (!ok) player?.failed();
      });
    }
  }

  function promptBody(card) {
    if (card.prompt.hideBody) return [];
    if (card.prompt.cloze) {
      const { before, after } = card.prompt.cloze;
      return [
        // What the gap wants, when the sentence alone does not say. Without it
        // a participle card is "guess which of four verbs" and a dative card
        // is "guess which of four people" — see `clozeSubject` in cards.js.
        card.prompt.subject
          ? el('p', { class: 'card__title', style: { textAlign: 'center' } }, card.prompt.subject)
          : null,
        el(
          'p',
          { class: 'screen__title', style: { marginBlockStart: 'var(--s2)', fontSize: 'var(--size-md)', lineHeight: 'var(--lh-base)' } },
          before,
          el('span', { class: 'cloze__gap', 'aria-label': 'missing word' }, ' '),
          after,
        ),
      ];
    }
    if (card.prompt.gloss) {
      return [el('p', { class: 'screen__title', style: { marginBlockStart: 'var(--s1)' } }, card.prompt.gloss)];
    }
    if (card.prompt.word) {
      return [
        el('p', { class: 'meter__label' }, card.kindLabel),
        el('p', { class: 'screen__title', style: { marginBlockStart: 'var(--s1)' } }, card.prompt.word),
        card.prompt.pronoun
          ? el('p', { class: 'drill__pronoun' }, card.prompt.pronoun, el('span', { class: 'drill__blank' }, ' '))
          : null,
        card.prompt.sentence
          ? el('p', { class: 'card__note', style: { marginBlockStart: 'var(--s3)', fontStyle: 'italic' } }, `“${card.prompt.sentence}”`)
          : null,
      ];
    }
    // A listening card shows nothing at all before the answer.
    return [el('p', { class: 'screen__title', style: { marginBlockStart: 'var(--s1)' } }, ' ')];
  }

  /**
   * The play button, and the text to fall back on when it will not play.
   *
   * A `listen` card deliberately shows nothing — no word, no sentence — because
   * the ear is supposed to do the work. That makes failed playback the worst
   * case in the app: an empty card with four options and no way to answer it
   * except by guessing. Offline with an unmirrored clip, a decode error, or
   * iOS refusing without a gesture all land there.
   *
   * So a failure shows the sentence. It is a worse exercise than the one
   * intended and the card says so, but reading is a way through and a blank
   * screen is not.
   */
  /**
   * A card the recording *is*, rather than one the recording illustrates.
   *
   * On a `heard` card the answer is a word inside the clip, and a `listen`
   * card shows no text at all by design. Everywhere else the audio is a bonus
   * and losing it costs nothing.
   */
  function audioOnly(card) {
    return card.type === 'listen' || card.item?.kind === 'heard';
  }

  /**
   * The way out of a card that cannot be heard.
   *
   * Reported from use as several questions where "audio did not play and I
   * couldn't answer". Both halves of that were real. A `heard` card that fails
   * to play deliberately withholds the transcript, because the transcript is
   * the answer — which rescued the exercise's integrity and left the learner
   * facing four options and no question. And the commoner case is worse,
   * because it is silent: an iPhone with the ringer switch off, or the volume
   * down, plays the clip successfully and inaudibly, so nothing fails and no
   * fallback appears at all.
   *
   * So the escape does not wait for an error. It is on every audio-only card
   * from the start, quiet enough not to be the obvious move, and it names the
   * likeliest cause — because "check the silent switch" fixes the session,
   * where skipping only fixes the card.
   *
   * Skipping is not an answer. It does not grade, does not touch the Leitner
   * box and does not file a mistake: nothing was got wrong, the question was
   * never asked.
   *
   * But it cannot only do nothing, and the first version's mistake was to think
   * it could. A card that is never answered never leaves box zero, so it stays
   * due — and the requeue put it back in the same session on top of that. It
   * came round again, and again the next day, forever. From the learner's side
   * that is indistinguishable from being marked wrong.
   *
   * So a skip *reports* the card, through the same flag store the "something
   * wrong with this card" link writes to, under its own reason. That suppresses
   * it from every future round rather than merely not promoting it, and it
   * turns up in Settings with an Undo — which is the right shape for a
   * judgement made in a hurry about a clip that might play fine tomorrow.
   */
  function skipControl(entry, card, deck) {
    const note = el('p', { class: 'card__note', hidden: true });
    const link = el(
      'button',
      {
        type: 'button',
        class: 'drill__teach-more',
        onclick: () => {
          if (note.hidden) {
            note.textContent =
              'On an iPhone, check the silent switch on the side and turn the volume up — the clip plays even when the phone is muted, so it can look like nothing happened. Tap again and this card is reported and put away for good; you can bring it back from Settings.';
            note.hidden = false;
            link.textContent = 'Skip and report it';
            return;
          }
          flagCard(settings.playerId, {
            source: deck.id,
            id: card.item.id,
            label: flagLabel(card),
            reason: 'silent',
          }).catch(() => {});
          // Out of the rest of this session too, not just future ones. The same
          // word can sit in the queue twice — once per strand — and hearing
          // "can't hear it" answered by the same silent clip again is the
          // complaint, not the fix.
          queue = queue.filter((other, at) => at <= index || other.item.id !== card.item.id);
          index += 1;
          renderCard();
        },
      },
      'Can’t hear it?',
    );
    return el('div', { style: { marginBlockStart: 'var(--s3)' } }, link, note);
  }

  function playButton(card, transcript) {
    const note = el('p', { class: 'card__note', hidden: true });
    const failed = () => {
      play.classList.remove('is-playing');
      // On a listening card the transcript *is* the answer, so falling back to
      // it would hand the card over rather than rescue it. Everywhere else the
      // sentence is the question arriving late and showing it is the fix; see
      // the note above `fallback`.
      if (card.item?.kind === 'heard') {
        note.textContent = 'This one needs sound — try tapping again, or come back with the volume up.';
        note.hidden = false;
        return;
      }
      const text = card.prompt.revealAfter ?? card.prompt.sentence ?? card.item.example?.lb ?? null;
      if (text && transcript) {
        transcript.replaceChildren(el('strong', {}, 'Audio would not play. '), document.createTextNode(`“${text}”`));
        transcript.hidden = false;
        note.hidden = true;
      } else {
        note.textContent = 'Audio would not play — try tapping again.';
        note.hidden = false;
      }
    };
    const play = el(
      'button',
      {
        type: 'button',
        class: 'player__play',
        'aria-label': card.type === 'listen' ? 'Play the sentence again' : 'Hear the example sentence',
        onclick: async () => {
          unlock();
          play.classList.add('is-playing');
          note.hidden = true;
          const ok = await clip.play();
          if (!ok) failed();
        },
      },
      el('svg', { viewBox: '0 0 24 24', width: '22', height: '22', 'aria-hidden': 'true', fill: 'currentColor' }, el('path', { d: 'M8 5 L19 12 L8 19 Z' })),
    );
    clip.on('ended', () => play.classList.remove('is-playing'));
    return { el: el('div', { style: { marginBlockStart: 'var(--s3)' } }, play, note), failed };
  }

  /**
   * The sentence a hint may be drawn from, whatever shape this card is.
   *
   * A listening card counts: its text is withheld, but one translated word is
   * a foothold rather than the answer, and the option list is what it is being
   * hidden from.
   */
  /**
   * A short human-readable name for a flagged card.
   *
   * Stored with the flag so Settings can list what was reported without
   * reloading every deck and re-deriving it — the decks are megabytes and the
   * list is a handful of rows.
   */
  function flagLabel(card) {
    const gloss = card.deck.gloss?.(card.item) ?? null;
    const word = card.item.lb ?? card.item.infinitive ?? sentenceOf(card, { filled: true }) ?? card.item.id;
    return gloss ? `${word} — ${gloss}` : String(word);
  }

  function sentenceOf(card, { filled = false } = {}) {
    if (card.prompt.cloze) {
      const { before, after } = card.prompt.cloze;
      // `filled` puts the answer back. The hint wants the gapped form (it must
      // not quote the missing word anyway); an explanation wants the real
      // sentence, because a gapped one is not a sentence to explain.
      const middle = filled ? (card.answer ?? '') : ' ';
      return `${before ?? ''}${middle}${after ?? ''}`.replace(/\s+/g, ' ').trim();
    }
    return card.prompt.sentence ?? card.prompt.revealAfter ?? card.item.example?.lb ?? null;
  }

  /**
   * "Hint" — one other word of the sentence, translated, behind a tap.
   *
   * Behind a tap rather than always visible because taking it should be a
   * decision: a hint read before the question was attempted is just a shorter
   * question, and the retrieval is where the learning is. Taking it is not
   * penalised either — the card is still graded on the answer — because the
   * alternative for a beginner staring at nine unknown words is to guess, and
   * a guess teaches nothing at all.
   */
  function hintControl(card) {
    const holder = el('div', { class: 'drill__hint', hidden: true });
    const text = el('p', { class: 'drill__hint-text', hidden: true });
    const trigger = button('Hint', {
      variant: 'ghost',
      class: 'btn btn--ghost',
      onclick: () => {
        trigger.hidden = true;
        text.hidden = false;
      },
    });
    holder.append(trigger, text);

    // Everything that would hand over the answer: what is being asked for, and
    // every option on screen, in whichever language they happen to be in.
    const exclude = [card.answer, card.lemma, card.item?.cloze?.form, ...(card.options ?? []).map((option) => option.value)];

    glossary.then((lookup) => {
      const found = hintFor(lookup, sentenceOf(card), { exclude });
      if (!found) return; // no safe word in this sentence — offer nothing
      text.replaceChildren(
        el('strong', {}, found.lb),
        document.createTextNode(` — ${found.en}`),
      );
      holder.hidden = false;
    });

    return holder;
  }

  /**
   * The rule, stated before the question rather than after the mistake.
   *
   * A teacher explains the rule and then sets the exercise. This app did the
   * reverse: the rule appeared only once you had already got it wrong, so the
   * first attempt at every grammar item was a guess by construction.
   *
   * On the first meeting of an item it is open, because that card is an
   * introduction and there is nothing yet to retrieve. From the first review
   * it is collapsed — still one tap away, but taking it is a decision, and
   * re-reading the rule every time would replace the recall the drill is for.
   */
  function teachBefore(card) {
    const topic = topicFor(card.item?.kind);
    if (!topic) return null;
    const first = (boxes.get(`${card.deck.id}:${card.strand}:${card.item.id}`) ?? 0) === 0;

    return el(
      'details',
      { class: 'drill__teach', open: first ? true : null },
      el('summary', {}, first ? `The rule — ${topic.title}` : 'Remind me of the rule'),
      el('p', { class: 'drill__teach-rule' }, topic.rule),
      ...topic.points.slice(0, 2).map((point) => el('p', { class: 'drill__teach-point' }, ...emphasise(point))),
      // Straight to this rule's own notecard rather than to the cheat sheet.
      // The sheet is one long page with every topic collapsed on it, so
      // "full explanation" used to mean "find your own way back to the thing
      // you were just stuck on".
      el(
        'a',
        { class: 'drill__teach-more', href: `#/notecards/${topic.id}` },
        'Full explanation in the guide',
      ),
    );
  }

  const nextHolder = el('div');

  function nextButton(entry) {
    const last = index >= queue.length - 1;
    return button(last ? 'Finish' : 'Next', {
      variant: 'primary',
      class: 'btn btn--primary btn--block',
      onclick: () => {
        index += 1;
        renderCard();
      },
    });
  }

  function grade(card, entry, result, { revealed, feedback, rule, explain }) {
    answeredCount += 1;
    answeredByDeck[card.deck.id] = (answeredByDeck[card.deck.id] ?? 0) + 1;
    // Sentence structure is a slice of the grammar deck, tallied under a key
    // no deck uses so Today's checklist can require it specifically. Without
    // this, the structure step would tick on any six grammar cards — which is
    // the same self-ticking checklist the grammar step already had to be
    // rescued from. Counted *as well as* grammar, not instead of: these cards
    // are grammar cards, and both steps should credit them.
    if (isStructure(card.item)) answeredByDeck.structure = (answeredByDeck.structure ?? 0) + 1;
    if (result.correct) correctCount += 1;

    // A retry is practice, not evidence — grading it would let a word be
    // promoted by the second attempt at the same question in the same minute,
    // which is exactly the spacing the box is supposed to enforce.
    if (!entry.retry) {
      recordLearnResult(settings.playerId, card.deck.id, card.strand, card.item.id, {
        correct: result.correct,
        partial: result.partial,
      });
      // The mistakes list, kept across sessions. A retry is excluded for the
      // same reason it is not graded: it is the same question a minute later.
      // An accent-only miss counts as correct here — the meaning was
      // retrieved, and filing it as a mistake would fill the list with
      // keyboard slips rather than things that are not known.
      if (result.correct) clearMistake(settings.playerId, card.deck.id, card.strand, card.item.id);
      else recordMistake(settings.playerId, card.deck.id, card.strand, card.item.id);
    }

    // Always show the full sentence and the exact spelling once the answer is
    // in — the card is over, and this is the moment the correct form is worth
    // reading.
    // Only reveal a sentence the card was not already showing. Gender cards
    // print the example in the prompt, and gloss cards do too from the first
    // review onwards, so an unconditional reveal rendered the same italic
    // sentence twice, one line under the other.
    const sentence = card.prompt.revealAfter ?? card.item.example?.lb ?? null;
    const reveal = sentence && sentence !== card.prompt.sentence ? sentence : null;
    if (reveal) {
      revealed.textContent = `“${reveal}”`;
      revealed.hidden = false;
    }
    if (explain) explain.hidden = false;

    if (!result.correct || result.partial) {
      feedback.textContent = result.articleWrong
        ? joinArticle(card.deck.article(card.item), card.lemma)
        : `${card.lemma}${card.answer !== card.lemma ? ` → ${card.answer}` : ''}`;
      feedback.hidden = false;
    }

    // A missed grammar card gets the rule it was testing, not just the right
    // spelling. Being shown that `Zäiten` beats `Zäite` here teaches this
    // sentence; being shown the n-rule teaches every sentence.
    const ruleText = !result.correct ? GRAMMAR_RULES[card.item.kind] : null;
    if (ruleText) {
      rule.textContent = ruleText;
      rule.hidden = false;
    }

    // An accent-only miss plays the rung it is on without climbing, which is
    // the same call the Leitner box makes: retrieved, but not cleanly enough
    // to count as ground gained.
    if (result.correct) chimeCorrect({ advance: !result.partial });
    else resetChimeStreak();

    const tone = result.correct && !result.partial ? 'celebrating' : result.correct ? 'thinking' : 'encouraging';
    const line = !result.correct
      ? pickLine(LINES.wrong)
      : result.articleWrong
        ? pickLine(LINES.article)
        : result.partial
          ? pickLine(LINES.partial)
          : pickLine(LINES.correct);
    amelie.say(line, tone);

    if (!result.correct) scheduleRetest(entry);

    // A third and two thirds of the way through the day's goal, the *next* tap
    // offers a break instead of the next card. Decided here rather than in
    // `renderCard` so the crossing is detected on the answer that caused it,
    // and consumed there — the learner still gets to read this card's feedback.
    if (wantsBreaks && breakPending === null) {
      const mark = dueCheckpoint({
        before: dayBefore + answeredCount - 1,
        after: dayBefore + answeredCount,
        goal: goalCards(settings),
        taken: breaksTaken,
      });
      if (mark !== null) breakPending = mark;
    }

    fill(nextHolder, nextButton(entry));
    nextHolder.hidden = false;
    nextHolder.firstChild?.focus();
  }

  /**
   * The break offer, and then the break.
   *
   * Two screens rather than one. The first is a menu, because which break is
   * right depends on where you are — "stand and stretch" is not an option on a
   * bus — and because being handed a choice is itself a small release from a
   * screen that has been telling you what to do for ten minutes.
   *
   * Nothing here is compulsory and nothing is scored. Carrying on is a
   * first-class button, not a grudging link, and it is the one that keeps
   * focus: a break you have to dismiss twice is an interruption, whatever it
   * is called.
   */
  function renderBreakOffer(mark) {
    let activity = null;
    const goal = goalCards(settings);
    const heading = mark >= Math.ceil(goal * (2 / 3)) ? 'Two thirds of the way through' : 'A third of the way through';
    const carryOn = () => {
      activity?.destroy();
      activity = null;
      renderCard();
    };

    const choices = el(
      'div',
      { class: 'stack' },
      ...BREAKS.map((entry) =>
        el(
          'button',
          {
            type: 'button',
            class: 'card brk__choice',
            onclick: () => runBreak(entry),
          },
          el('span', { class: 'card__title' }, entry.title),
          el('span', { class: 'card__note' }, entry.blurb),
          el('span', { class: 'chip' }, entry.load),
        ),
      ),
    );

    const menu = el(
      'div',
      { class: 'stack stack--lg' },
      el(
        'div',
        { class: 'card', style: { textAlign: 'center' } },
        el('p', { class: 'meter__label' }, 'Breathing space'),
        el('p', { class: 'card__title' }, `${heading} — take a minute?`),
        el(
          'p',
          { class: 'card__note' },
          'Short pauses beat none, and what you do in them matters: the ones that ask least of your attention are the ones the next block benefits from.',
        ),
      ),
      choices,
      button('Keep going', { variant: 'secondary', class: 'btn btn--secondary btn--block', onclick: carryOn }),
    );

    function runBreak(entry) {
      // Declared before the break is built: `trace` can call back synchronously
      // when it fails to generate a puzzle, and reaching `done` from inside
      // that call would hit the temporal dead zone.
      const done = el('div', { hidden: true }, button('Back to it', { variant: 'primary', class: 'btn btn--primary btn--block', onclick: carryOn }));
      activity = renderBreak(entry.id, () => {
        done.hidden = false;
        done.firstChild?.focus();
      });
      fill(
        body,
        el(
          'div',
          { class: 'card', style: { textAlign: 'center' } },
          el('p', { class: 'meter__label' }, entry.title),
          el('p', { class: 'card__note' }, entry.blurb),
          activity?.el ?? null,
        ),
        el('p', { class: 'source-note', style: { textAlign: 'center' } }, entry.why),
        done,
        // Always available, because a break you cannot leave is not a break.
        button('Skip it', { variant: 'secondary', class: 'btn btn--secondary btn--block', onclick: carryOn }),
      );
    }

    fill(body, menu);
  }

  /** Push a missed card back into the queue, a few cards further on. */
  function scheduleRetest(entry) {
    if (entry.retry) {
      // Already a second attempt and still wrong. Re-queue once more at the
      // very end rather than looping — the session has to be able to finish.
      if (!entry.thirdTime) queue.push({ ...entry, retry: true, thirdTime: true });
      return;
    }
    const at = Math.min(index + RETEST_GAP, queue.length);
    queue = [...queue.slice(0, at), { ...entry, retry: true }, ...queue.slice(at)];
  }

  /**
   * File what was practised, once.
   *
   * Called both when the session finishes and when the screen is torn down,
   * because sessions get abandoned halfway far more often than they get
   * completed — a phone rings, a tab closes. Every individual answer is
   * already saved by `recordLearnResult`, so losing the session row would mean
   * the boxes moved but the scoreboard never heard about it.
   */
  let logged = false;
  function logSession() {
    if (logged || answeredCount === 0) return;
    logged = true;
    recordLearnSession(settings.playerId, { correct: correctCount, answered: answeredCount, byDeck: { ...answeredByDeck } });
  }

  async function finish() {
    destroyClip();
    progressFill.style.width = '100%';
    progressFill.classList.add('progress__fill--ok');
    touchStreak(settings.playerId);

    // Snapshotted either side of logSession(), which is the write that can
    // move today's cards from short of the goal to met. This is the one place
    // that transition is ever observed, so it is also the only place Amelie's
    // "goal met" moment can fire — today.js and learn.js only ever render the
    // stage a goal is *already* at, never the crossing.
    const before = await todayProgress(settings.playerId, { goal: goalCards(settings) });
    logSession();
    const after = await todayProgress(settings.playerId, { goal: goalCards(settings) });
    const justMetGoal = !before.met && after.met;

    const pct = answeredCount === 0 ? 0 : Math.round((correctCount / answeredCount) * 100);
    const done = new Amelie({ size: 'lg', bubble: true });
    done.el.classList.add('amelie--stack', 'amelie--hero');
    done.setProgress(after.pct, after.met);

    // Built and inserted before celebrate()/flyAround() run: both measure
    // done.el's live position (confetti centres on it, the flight clone
    // starts from it), and a detached node measures as a zero-size rect at
    // 0,0 — which reads as confetti bursting from the corner of the screen.
    fill(
      body,
      el(
        'div',
        { class: 'stack stack--lg', style: { paddingBlockStart: 'var(--s5)' } },
        done.el,
        el(
          'div',
          { class: 'card', style: { textAlign: 'center' } },
          el('p', { class: 'meter__label' }, 'This session'),
          el('p', { class: 'meter__value' }, `${correctCount} / ${answeredCount}`),
          el('p', { class: 'card__note' }, `${pct}% · +${correctCount * POINTS.perLearnCorrect} points`),
        ),
        button('Keep going', { variant: 'primary', class: 'btn btn--primary btn--block', onclick: () => navigate(again) }),
        button('Back to Learn', { variant: 'secondary', class: 'btn btn--secondary btn--block', onclick: () => navigate('#/learn') }),
      ),
    );

    done.celebrate(justMetGoal ? AMELIE_LINES.dailyGoalMet : AMELIE_LINES.learnSetDone);
    if (justMetGoal) done.flyAround();
  }

  breaksReady.then(renderCard);

  return {
    destroy() {
      destroyClip();
      reference.destroy();
      logSession();
    },
  };
}

/**
 * The empty state, shared by every deck: nothing is due, which is a good
 * outcome and should not read like an error.
 */
export function nothingDue({ root, title, back, navigate, total }) {
  root.append(
    screenHead({ title, back }),
    el(
      'div',
      { class: 'empty' },
      // "You are caught up" is now simply true. It used to have to compete
      // with a second reason for an empty session — the daily new-word budget
      // being spent, which meant there *was* more of the deck waiting and the
      // app was holding it back. That budget is gone, so an empty session can
      // only mean an empty queue.
      el('p', {}, 'Nothing due right now — you are caught up.'),
      el('p', { class: 'card__note' }, `${plural(total, 'word')} in this deck. Come back when the next review falls due.`),
      button('Back to Learn', { variant: 'secondary', onclick: () => navigate('#/learn') }),
    ),
  );
  return { destroy() {} };
}

/**
 * "Explain this sentence", asked in the context of the exercise just answered.
 *
 * `task` is a one-line description of what was actually being asked — see
 * `CARD_TASKS` in cards.js. Without it the same paragraph came back whichever
 * card you were on, so a gender question, a blind listening card and an
 * Eifeler-Regel question were all answered with general remarks about word
 * order. The explanation people want is about the thing they just got wrong.
 *
 * The cache key carries the task for the same reason: keyed on the item alone,
 * the first explanation a word ever got was replayed for every later exercise
 * on it, which is how a context-aware answer would have been thrown away.
 *
 * `label` names what is actually on offer. "Explain this sentence" is wrong on
 * a card that has no sentence — a `perfect-aux` card is a verb and two
 * auxiliaries — and it is wrong on a word-order card too, where the question
 * is not what the sentence means but why this arrangement of it is the right
 * one. A button that promises the wrong thing is not tapped.
 *
 * @param {{id: string, lb: string|null, word: string|null, label?: string, en: string|null, task: string|null, facts?: string|null}} subject
 */
export function explainButton(settings, subject) {
  const key = `${subject.id}:${EXPLAIN_PROMPT_VERSION}:${hashTask(`${subject.task ?? ''}|${subject.facts ?? ''}`)}`;
  /**
   * The English translation, above everything else.
   *
   * The explanation used to open straight into the point about word order or
   * gender, on top of a sentence the learner very often cannot read at all —
   * so the observation had nothing to attach to. What it means comes first
   * now, in its own line, and the rest builds on it.
   */
  const translation = el('p', { class: 'drill__translation', hidden: true });
  const note = el('p', { class: 'card__note', style: { marginBlockStart: 'var(--s2)', textAlign: 'left' }, hidden: true });

  const show = (result) => {
    // Entries cached before the translation existed are plain strings. They
    // are keyed under an older EXPLAIN_PROMPT_VERSION so this should not
    // happen, but rendering "[object Object]" at someone is a poor way to
    // find out otherwise.
    const value = typeof result === 'string' ? { explanation: result, translation: null } : result;
    translation.textContent = value.translation ?? '';
    translation.hidden = !value.translation;
    note.textContent = value.explanation ?? '';
    note.hidden = false;
  };

  const trigger = button(subject.label ?? 'Explain this sentence', {
    variant: 'secondary',
    class: 'btn btn--secondary',
    style: { marginBlockStart: 'var(--s3)' },
    onclick: async () => {
      trigger.disabled = true;
      const cached = await getSentenceExplanation(key);
      if (cached) {
        show(cached);
        trigger.hidden = true;
        return;
      }
      note.textContent = 'Asking…';
      note.hidden = false;
      const result = await requestExplanation(settings, {
        lb: subject.lb,
        word: subject.word,
        en: subject.en,
        task: subject.task,
        facts: subject.facts,
      });
      if (result.ok) {
        const value = { translation: result.translation ?? null, explanation: result.explanation };
        await saveSentenceExplanation(key, value);
        show(value);
        trigger.hidden = true;
      } else {
        note.textContent = result.message;
        trigger.disabled = false;
      }
    },
  });
  return el('div', {}, trigger, translation, note);
}

/** A short stable tag for a task string, so cache keys stay readable and short. */
function hashTask(task) {
  let hash = 0;
  for (let i = 0; i < task.length; i += 1) hash = (Math.imul(31, hash) + task.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}
