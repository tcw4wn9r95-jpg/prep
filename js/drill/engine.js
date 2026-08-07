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

import { el, fill, screenHead, button, plural } from '../dom.js';
import { Amelie, AMELIE_LINES, pickLine } from '../amelie.js';
import { Clip, unlock } from '../audio.js';
import { getSentenceExplanation, saveSentenceExplanation, recordLearnResult, recordLearnSession, todayProgress, recordMistake, clearMistake, goalCards, POINTS, touchStreak } from '../store.js';
import { requestExplanation } from '../sync.js';
import { buildCard, GRAMMAR_RULES, joinArticle, taskFor, factsFor, isStructure } from './cards.js';
import { loadGlossary } from '../content.js';
import { hintFor } from './hint.js';
import { topicFor } from '../grammar-guide.js';
import { INPUTS } from './inputs.js';
import { referenceSheet } from './reference-sheet.js';
import { chimeCorrect, resetChimeStreak } from '../chime.js';

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
    // The sentence is whatever this card actually put on screen — a cloze or a
    // grammar item has no `example`, it has a `before`/`after` pair, and those
    // cards were the ones silently going without an explanation at all.
    const explainSentence = sentenceOf(card, { filled: true });
    const explain = explainSentence
      ? explainButton(settings, {
          id: card.item.id,
          lb: explainSentence,
          word: card.answer ?? card.lemma,
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
      revealed,
      feedback,
      rule,
      explain,
    );

    const inputFactory = INPUTS[card.mode];
    const input = inputFactory(card, (result) => grade(card, entry, result, { revealed, feedback, rule, explain }));

    fill(body, prompt, el('p', { class: 'drill__instruction' }, card.instruction), input.el, hint, amelie.el, nextHolder);
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
  function playButton(card, transcript) {
    const note = el('p', { class: 'card__note', hidden: true });
    const failed = () => {
      play.classList.remove('is-playing');
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
      ...topic.points.slice(0, 2).map((point) => el('p', { class: 'drill__teach-point' }, point)),
      el(
        'a',
        { class: 'drill__teach-more', href: '#/reference' },
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

    fill(nextHolder, nextButton(entry));
    nextHolder.hidden = false;
    nextHolder.firstChild?.focus();
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

  renderCard();

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
export function nothingDue({ root, title, back, navigate, total, capped = false }) {
  root.append(
    screenHead({ title, back }),
    el(
      'div',
      { class: 'empty' },
      // "You are caught up" is only true when the queue is genuinely empty.
      // When the day's new-word budget is spent it is not: there is more of
      // this deck waiting, and the app is holding it back on purpose. Saying
      // the wrong one of these is what makes a step counter look broken —
      // you tap "116 / 120", get an empty screen, and nothing explains why the
      // last four never arrive.
      el('p', {}, capped ? "That is today's new words done." : 'Nothing due right now — you are caught up.'),
      el(
        'p',
        { class: 'card__note' },
        capped
          ? 'New words are capped per day so they actually stick — the rest of this step is waiting for tomorrow. Reviews of what you have already met still count today.'
          : `${plural(total, 'word')} in this deck. Come back when the next review falls due.`,
      ),
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
 * @param {{id: string, lb: string, word: string, en: string|null, task: string|null}} subject
 */
export function explainButton(settings, subject) {
  const key = `${subject.id}:${hashTask(`${subject.task ?? ''}|${subject.facts ?? ''}`)}`;
  const note = el('p', { class: 'card__note', style: { marginBlockStart: 'var(--s2)', textAlign: 'left' }, hidden: true });
  const trigger = button('Explain this sentence', {
    variant: 'secondary',
    class: 'btn btn--secondary',
    style: { marginBlockStart: 'var(--s3)' },
    onclick: async () => {
      trigger.disabled = true;
      const cached = await getSentenceExplanation(key);
      if (cached) {
        note.textContent = cached;
        note.hidden = false;
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
        await saveSentenceExplanation(key, result.explanation);
        note.textContent = result.explanation;
        trigger.hidden = true;
      } else {
        note.textContent = result.message;
        trigger.disabled = false;
      }
    },
  });
  return el('div', {}, trigger, note);
}

/** A short stable tag for a task string, so cache keys stay readable and short. */
function hashTask(task) {
  let hash = 0;
  for (let i = 0; i < task.length; i += 1) hash = (Math.imul(31, hash) + task.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}
