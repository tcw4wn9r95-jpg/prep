/**
 * Verb school — the screen. See `app/js/verbschool.js` for what is taught and
 * why it is grouped the way it is.
 *
 * Two views behind one route. `#/school` lists the categories with how far
 * through each one you are; `#/school/<id>` works the next unfinished word in
 * that category through its next unfinished stage.
 *
 * ## Why it keeps its own progress rather than moving the Leitner boxes
 *
 * The same call `pairs.js` and `gender-sort.js` make. Picking a gloss out of
 * four verbs you have just been shown is a much lighter task than the vocab
 * deck's own recall cards, and letting it promote the same boxes would drift
 * the review schedule without anything looking wrong. It counts for the streak,
 * because turning up is the thing worth rewarding, and it records what you have
 * finished so the course is something you can come back to.
 */

import { el, fill, screenHead, button, plural } from '../dom.js';
import { Amelie, AMELIE_LINES, pickLine } from '../amelie.js';
import { Clip, unlock } from '../audio.js';
import { loadVerbs, loadVocab } from '../content.js';
import { touchStreak, getSettings, saveSettings } from '../store.js';
import { chimeCorrect, resetChimeStreak } from '../chime.js';
import { flagSlot } from '../flag.js';
import {
  CATEGORIES,
  categoryById,
  entriesFor,
  stagesFor,
  categoryProgress,
  nextUp,
  progressKey,
  meaningQuestion,
  tableQuestions,
  sentenceQuestion,
  glossOf,
} from '../verbschool.js';

/* -------------------------------------------------------------- progress */

/**
 * What has been finished, as a Set of `wordId:stage`.
 *
 * Kept in settings rather than in its own store: 145 short strings is small
 * enough that a schema migration would cost more than it is worth, and this is
 * a course you finish once rather than a scheduler that has to be queried.
 */
async function loadDone() {
  const settings = await getSettings();
  return new Set(settings.school ?? []);
}

async function markDone(key) {
  const settings = await getSettings();
  const done = new Set(settings.school ?? []);
  if (done.has(key)) return done;
  done.add(key);
  await saveSettings({ school: [...done] });
  return done;
}

/* ----------------------------------------------------------------- index */

export async function render(root, { params, settings, navigate }) {
  const [verbs, vocab, done] = await Promise.all([loadVerbs(), loadVocab(), loadDone()]);
  const decks = { verbs, vocab };

  const category = categoryById(params?.[0]);
  if (category) return renderCategory(root, category, decks, done, { settings, navigate });

  const cards = CATEGORIES.map((entry) => {
    const words = entriesFor(entry, decks);
    const { finished, total, ratio } = categoryProgress(entry, words, done);
    const complete = total > 0 && finished === total;
    return el(
      'a',
      { class: 'card school__cat', href: `#/school/${entry.id}` },
      el(
        'div',
        { class: 'row row--between' },
        el('span', { class: 'card__title' }, entry.title),
        el('span', { class: 'chip' }, complete ? 'done' : `${finished} / ${total}`),
      ),
      el('p', { class: 'card__note' }, entry.blurb),
      el(
        'div',
        { class: 'progress', role: 'progressbar', 'aria-label': `${entry.title} progress` },
        el('div', { class: 'progress__fill', style: { width: `${Math.round(ratio * 100)}%` } }),
      ),
      el('p', { class: 'source-note' }, plural(words.length, 'word')),
    );
  });

  root.append(
    screenHead({ title: 'Verb school', sub: 'The course verbs, one at a time', back: '#/learn' }),
    el(
      'div',
      { class: 'card' },
      el(
        'p',
        { class: 'card__note' },
        'Each word is worked through what it means, how it conjugates, and how it looks in a real sentence. Every form and every sentence comes from LOD, so what you practise here is what the dictionary actually publishes.',
      ),
    ),
    el('div', { class: 'stack stack--lg', style: { marginBlockStart: 'var(--s4)' } }, ...cards),
  );
  return { destroy() {} };
}

/* ----------------------------------------------------------- one category */

function renderCategory(root, category, decks, done, { settings, navigate }) {
  const words = entriesFor(category, decks);
  const amelie = new Amelie({ size: 'sm', bubble: true });
  let clip = null;
  const body = el('div', { class: 'stack stack--lg' });
  // Built once and re-pointed at each word. `flagSlot()` returns a controller,
  // not a node — putting the controller itself in the tree renders the string
  // "[object Object]" at the bottom of every card, which is exactly what it did.
  const flag = flagSlot();

  const destroyClip = () => {
    if (clip) {
      clip.destroy();
      clip = null;
    }
  };

  root.append(screenHead({ title: category.title, sub: category.blurb, back: '#/school' }), body);

  function step() {
    destroyClip();
    amelie.say(null, 'idle');
    const up = nextUp(category, words, done);
    if (!up) return finish();
    const { entry, stage } = up;
    const stages = stagesFor(category, entry, words);
    const at = stages.findIndex((one) => one.id === stage.id) + 1;

    const head = el(
      'div',
      { class: 'card', style: { textAlign: 'center' } },
      el('p', { class: 'meter__label' }, `${entry.word} · step ${at} of ${stages.length}`),
      el('p', { class: 'card__title' }, stage.title),
    );

    const asked =
      stage.id === 'meaning'
        ? renderMeaning(entry)
        : stage.id === 'table'
          ? renderTable(entry)
          : renderSentence(entry);

    flag.set({ playerId: settings.playerId, source: 'school', id: entry.id, label: `${entry.word} — ${glossOf(entry, words)}` });
    fill(body, head, asked, amelie.el, flag.el);
  }

  /** One choice question, with the shared right/wrong handling. */
  function choice({ prompt, instruction, question, onDone, after = null }) {
    const wrap = el('div', { class: 'stack' });
    const feedback = el('p', { class: 'card__note', hidden: true });
    let answered = false;

    const buttons = question.options.map((option) =>
      el(
        'button',
        {
          type: 'button',
          class: 'option school__option',
          onclick: () => {
            if (answered) return;
            answered = true;
            const right = option === question.answer;
            for (const node of buttons) {
              if (node.dataset.value === question.answer) node.classList.add('is-correct');
              else if (node.dataset.value === option) node.classList.add('is-wrong');
              node.disabled = true;
            }
            if (right) chimeCorrect();
            else resetChimeStreak();
            amelie.say(right ? pickLine(AMELIE_LINES.correct ?? ['Right.']) : 'Not that one — the right answer is marked.', right ? 'celebrating' : 'encouraging');
            if (after) {
              feedback.replaceChildren(after());
              feedback.hidden = false;
            }
            fill(next, button(right ? 'Next' : 'Try the next one', { variant: 'primary', class: 'btn btn--primary btn--block', onclick: () => onDone(right) }));
            next.hidden = false;
          },
          dataset: { value: option },
        },
        option,
      ),
    );

    const next = el('div', { hidden: true });
    wrap.append(
      prompt,
      el('p', { class: 'drill__instruction' }, instruction),
      el('div', { class: 'options' }, ...buttons),
      feedback,
      next,
    );
    return wrap;
  }

  function renderMeaning(entry) {
    const question = meaningQuestion(entry, words);
    return choice({
      prompt: el('div', { class: 'card', style: { textAlign: 'center' } }, el('p', { class: 'prompt__word' }, entry.word)),
      instruction: 'What does it mean?',
      question,
      onDone: (right) => advance(entry, 'meaning', right),
    });
  }

  /**
   * The six forms, asked one person at a time and only marked finished when
   * the whole table has been through.
   *
   * Options are the verb's own other forms, so the question is about the ending
   * rather than about recognising the verb — that was the meaning stage's job.
   */
  function renderTable(entry) {
    const questions = tableQuestions(entry);
    let index = 0;
    const holder = el('div', { class: 'stack' });
    let wrong = 0;

    const ask = () => {
      const question = questions[index];
      const table = el(
        'div',
        { class: 'card school__table' },
        ...questions.map((row, at) =>
          el(
            'div',
            { class: `row row--between school__row${at === index ? ' is-current' : ''}` },
            el('span', { class: 'meter__label' }, row.person.pronoun),
            el('span', {}, at < index ? row.answer : at === index ? '…' : ''),
          ),
        ),
      );
      fill(
        holder,
        choice({
          prompt: table,
          instruction: `Which form goes with ${question.person.pronoun}?`,
          question,
          onDone: (right) => {
            if (!right) wrong += 1;
            index += 1;
            if (index >= questions.length) advance(entry, 'table', wrong === 0);
            else ask();
          },
        }),
      );
    };
    ask();
    return holder;
  }

  /**
   * The verb in the sentence LOD published for it, then the recording.
   *
   * The recording plays only once the answer is in. Playing it first would say
   * the missing word out loud, which is the whole question.
   */
  function renderSentence(entry) {
    const question = sentenceQuestion(entry, words);
    if (!question) {
      // Cannot happen through `nextUp`, which does not offer a stage a word has
      // no question for — but a screen that throws is worse than one that moves on.
      advance(entry, 'sentence', true);
      return el('div');
    }
    const gap = el('span', { class: 'cloze__gap' }, '____');
    return choice({
      prompt: el(
        'div',
        { class: 'card', style: { textAlign: 'center' } },
        el('p', { class: 'prompt__sentence' }, question.before, gap, question.after),
        el('p', { class: 'card__note' }, `${entry.word} — ${glossOf(entry, words)}`),
      ),
      instruction: 'Which form does the sentence need?',
      question,
      onDone: (right) => advance(entry, 'sentence', right),
      after: () => {
        gap.textContent = question.answer;
        gap.classList.add('is-filled');
        if (!question.audioId) return el('span', {}, 'That is the sentence LOD publishes for this word.');
        const play = button('Hear it', {
          variant: 'secondary',
          onclick: async () => {
            unlock();
            destroyClip();
            clip = new Clip(question.audioId);
            const ok = await clip.play();
            if (!ok) play.textContent = 'Audio would not play';
          },
        });
        // Offered rather than autoplayed: the answer is already on screen, and
        // a clip that starts on its own mid-session is startling.
        return play;
      },
    });
  }

  async function advance(entry, stageId, right) {
    if (right) done = await markDone(progressKey(entry.id, stageId));
    else done = new Set(done);
    step();
  }

  function finish() {
    touchStreak(settings.playerId).catch(() => {});
    amelie.say(AMELIE_LINES.learnSetDone ?? 'Finished.', 'celebrating');
    fill(
      body,
      el(
        'div',
        { class: 'card', style: { textAlign: 'center' } },
        el('p', { class: 'card__title' }, `${category.title} — finished`),
        el('p', { class: 'card__note' }, category.note),
      ),
      amelie.el,
      button('Back to the categories', { variant: 'primary', class: 'btn btn--primary btn--block', onclick: () => navigate('#/school') }),
    );
  }

  step();
  return { destroy: destroyClip };
}
