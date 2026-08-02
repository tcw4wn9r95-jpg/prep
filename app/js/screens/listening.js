/**
 * Verstoen — the B1 listening run.
 *
 * Mirrors what INLL publishes: three exercises of 5, 7 and 4 multiple-choice
 * questions. Every recording is a native speaker from LOD and every option is
 * a LOD sentence or headword, verbatim.
 *
 * The transcript toggle is always present, per the brief's quality floor:
 * all audio has a visible transcript.
 */

import { el, fill, screenHead, button, plural } from '../dom.js';
import { Amelie, AMELIE_LINES, pickLine } from '../amelie.js';
import { Clip, renderBars, unlock } from '../audio.js';
import { chimeCorrect, resetChimeStreak } from '../chime.js';
import { listeningForTopic, topicIcon } from '../content.js';
import { saveAttempt, touchStreak, weekSeed, setVerdict, POINTS } from '../store.js';

export async function render(root, { params, settings, navigate }) {
  const topicId = params[0];
  const set = topicId ? await listeningForTopic(topicId) : null;

  if (!set) {
    root.append(
      screenHead({ title: 'Listening', back: '#/journey' }),
      el('div', { class: 'empty' }, el('p', {}, 'That topic has no listening set yet.'), button('Back to the journey', { variant: 'secondary', onclick: () => navigate('#/journey') })),
    );
    return { destroy() {} };
  }

  // Flatten the three exercises into one run, keeping the exercise boundary so
  // the header can announce it the way the real paper does.
  const questions = set.exercises.flatMap((exercise) =>
    exercise.questions.map((question) => ({ ...question, exercise })),
  );

  let index = 0;
  let correctCount = 0;
  let answered = false;
  let clip = null;
  /**
   * Every question that was got wrong, kept for the end-of-set review.
   *
   * Inline feedback is shown and then scrolled past: the option turns red, the
   * next question replaces it, and nothing about the miss survives. That is the
   * one shape of practice testing that can leave a learner worse off — with
   * multiple choice, retrieval without corrective feedback raises the chance of
   * later recognising the *wrong* option as familiar. So the misses are held
   * here and shown together at the end, with the transcript that answers them.
   */
  const missed = [];

  const amelie = new Amelie({ size: 'sm', bubble: true });
  const progressFill = el('div', { class: 'progress__fill', style: { width: '0%' } });
  const body = el('div', { class: 'stack stack--lg' });

  root.append(
    screenHead({
      title: set.title_en,
      sub: `${questions.length} questions · A1–B1`,
      back: '#/journey',
      trailing: el('span', { class: 'chip' }, topicIcon(set.topic)),
    }),
    el('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Progress' }, progressFill),
    body,
  );

  function destroyClip() {
    if (clip) {
      clip.destroy();
      clip = null;
    }
  }

  function renderQuestion() {
    destroyClip();
    answered = false;
    const question = questions[index];
    clip = new Clip(question.audioId);

    progressFill.style.width = `${(index / questions.length) * 100}%`;

    const player = el('div', { class: 'player' });
    const playButton = el(
      'button',
      {
        type: 'button',
        class: 'player__play',
        'aria-label': 'Play the recording',
        onclick: async () => {
          unlock();
          if (clip.isPlaying) {
            clip.stop();
            player.classList.remove('is-playing');
            amelie.setState('idle');
            return;
          }
          const ok = await clip.play();
          if (!ok) {
            transcriptWrap.hidden = false;
            transcriptToggle.setAttribute('aria-expanded', 'true');
            amelie.say('The audio would not play here. The transcript is open instead.', 'encouraging');
            return;
          }
          player.classList.add('is-playing');
          amelie.setState('listening');
        },
      },
      el(
        'svg',
        { viewBox: '0 0 24 24', width: '26', height: '26', 'aria-hidden': 'true', fill: 'currentColor' },
        el('path', { d: 'M8 5 L19 12 L8 19 Z' }),
      ),
    );
    player.append(playButton, renderBars(), el('span', { class: 'player__count' }, `${index + 1}/${questions.length}`));

    clip.on('ended', () => {
      player.classList.remove('is-playing');
      amelie.setState('idle');
    });

    // --- transcript, always available
    const transcriptText = el('p', { class: 'transcript' });
    renderTranscript(transcriptText, question, false);
    const showTranscript = question.kind === 'comprehension' || settings.transcriptDefault;
    const transcriptWrap = el('div', { hidden: !showTranscript }, transcriptText);
    const transcriptToggle = el(
      'button',
      {
        type: 'button',
        class: 'btn btn--ghost',
        'aria-expanded': showTranscript ? 'true' : 'false',
        onclick: () => {
          transcriptWrap.hidden = !transcriptWrap.hidden;
          transcriptToggle.setAttribute('aria-expanded', transcriptWrap.hidden ? 'false' : 'true');
        },
      },
      'Transcript',
    );

    // --- options (comprehension uses English options, everything else Luxembourgish)
    const optionsList = question.options_en ?? question.options_lb;
    const optionsEl = el('div', { class: 'options' });
    const optionButtons = optionsList.map((option, optionIndex) =>
      el(
        'button',
        {
          type: 'button',
          class: 'option',
          onclick: () => answer(optionIndex),
        },
        el('span', { class: 'option__key' }, String.fromCharCode(65 + optionIndex)),
        el('span', {}, option),
      ),
    );
    fill(optionsEl, ...optionButtons);

    const next = button(index === questions.length - 1 ? 'Finish' : 'Next', {
      variant: 'primary',
      class: 'btn btn--primary btn--block',
      hidden: true,
      onclick: () => {
        if (index === questions.length - 1) finish();
        else {
          index += 1;
          renderQuestion();
        }
      },
    });

    function answer(chosen) {
      if (answered) return;
      answered = true;
      optionsEl.classList.add('is-answered');
      const isRight = chosen === question.correct;
      if (isRight) correctCount += 1;
      else {
        missed.push({
          n: index + 1,
          question: question.question_en,
          question_lb: question.question_lb ?? null,
          chose: optionsList[chosen],
          right: optionsList[question.correct],
          transcript: question.transcript,
          audioId: question.audioId,
        });
      }

      optionButtons[question.correct].classList.add('is-correct');
      if (!isRight) optionButtons[chosen].classList.add('is-wrong');

      // Reveal the answer in the transcript too — seeing it written is where
      // the learning happens for a gap-fill.
      renderTranscript(transcriptText, question, true);
      transcriptWrap.hidden = false;
      transcriptToggle.setAttribute('aria-expanded', 'true');

      // chimeCorrect() stays silent if the clip is still running — see chime.js.
      if (isRight) chimeCorrect();
      else resetChimeStreak();

      amelie.say(pickLine(isRight ? AMELIE_LINES.correct : AMELIE_LINES.wrong), isRight ? 'celebrating' : 'encouraging');
      next.hidden = false;
      next.focus();
    }

    fill(
      body,
      el(
        'div',
        { class: 'stack' },
        el('p', { class: 'screen__sub' }, question.exercise.n === 0
          ? `A1 · ${question.exercise.title_en}`
          : `Exercise ${question.exercise.n} · ${question.exercise.title_en}`),
        player,
        el('div', { class: 'row', style: { justifyContent: 'flex-end' } }, transcriptToggle),
        transcriptWrap,
      ),
      el(
        'div',
        { class: 'stack' },
        question.question_lb
          ? el('h2', { class: 'card__title' }, question.question_lb)
          : null,
        el('p', { class: question.question_lb ? 'screen__sub' : 'card__title' }, question.question_en),
        optionsEl,
      ),
      amelie.el,
      next,
    );

    // Autoplay is not permitted before a gesture on iOS, so the first question
    // waits for a tap; later ones can start themselves once audio is unlocked.
    if (index > 0) {
      clip.play().then((ok) => {
        if (ok) {
          player.classList.add('is-playing');
          amelie.setState('listening');
        }
      });
    } else {
      amelie.say(AMELIE_LINES.listeningStart, 'idle');
    }
  }

  async function finish() {
    destroyClip();
    await saveAttempt({
      playerId: settings.playerId,
      itemId: set.id,
      topic: set.topic,
      correct: correctCount,
      total: questions.length,
      weekSeed: weekSeed(),
    });
    await touchStreak(settings.playerId);

    const pct = Math.round((correctCount / questions.length) * 100);
    const verdict = setVerdict(pct);

    progressFill.style.width = '100%';
    progressFill.classList.add(verdict.passed ? 'progress__fill--ok' : 'progress__fill--bad');

    const done = new Amelie({ size: 'lg', bubble: true });
    done.el.classList.add('amelie--stack', 'amelie--hero');
    // Celebrating a fail is the one thing that makes every other number in the
    // app untrustworthy: the readiness estimate is built on these attempts, and
    // it will report the same 20% back as "below the line" ten seconds later.
    // Above the line she celebrates; below it she says what happened and what
    // to do about it.
    if (verdict.passed) done.celebrate(verdict.line);
    else done.say(verdict.line, 'encouraging');

    fill(
      body,
      el(
        'div',
        { class: 'stack stack--lg', style: { paddingBlockStart: 'var(--s5)' } },
        done.el,
        el(
          'div',
          { class: 'card', style: { textAlign: 'center' } },
          el('p', { class: 'meter__label' }, 'This set'),
          el('p', { class: 'meter__value' }, `${correctCount} / ${questions.length}`),
          el(
            'div',
            { class: 'meter__track', style: { marginBlockStart: 'var(--s3)' } },
            el('div', { class: `meter__fill ${verdict.passed ? 'is-pass' : 'is-fail'}`, style: { width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` } }),
            // The 50% line the exam is actually marked against, drawn in the
            // same place the readiness meters draw it.
            el('span', { class: 'meter__threshold', 'aria-hidden': 'true' }),
          ),
          el('p', { class: 'card__note', style: { marginBlockStart: 'var(--s2)' } }, `${pct}% · ${verdict.label} · +${correctCount * POINTS.perCorrectAnswer} points`),
        ),
        missed.length > 0 ? missReview(missed) : null,
        // Deliberately no "try this set again": the questions and their order
        // are fixed, so a second run would be recall of the answer key rather
        // than listening — and every attempt is averaged into the B1 readiness
        // estimate, so it would inflate the one number the exam plan reads.
        // Another topic is the honest way to practise the same skill again.
        button('Record a speaking answer', { variant: 'primary', class: 'btn btn--primary btn--block', onclick: () => navigate(`#/speaking/${set.topic}`) }),
        button('Another topic', { variant: 'secondary', class: 'btn btn--secondary btn--block', onclick: () => navigate('#/journey') }),
      ),
    );
  }

  renderQuestion();
  return { destroy: destroyClip };
}

/**
 * The questions that were got wrong, with the answer and the transcript that
 * settles it.
 *
 * Practice testing is only reliably good for retention when the retrieval is
 * followed by corrective feedback; with multiple choice specifically, an
 * unreviewed wrong pick can be remembered later as the familiar one. The
 * inline red option disappears with the question, so this is the only place a
 * miss is available to actually be learned from.
 */
/** Enough of a sentence to recognise it in a list, cut on a word boundary. */
function snippet(text, limit = 46) {
  const clean = String(text ?? '').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function missReview(missed) {
  return el(
    'div',
    { class: 'card' },
    el('p', { class: 'card__title' }, `Worth another look — ${plural(missed.length, 'question')}`),
    el(
      'p',
      { class: 'card__note', style: { marginBlockEnd: 'var(--s3)' } },
      'The transcript under each one contains the answer. Reading it is where the mark comes from next time.',
    ),
    el(
      'div',
      { class: 'stack' },
      ...missed.map((miss) =>
        el(
          'details',
          { class: 'ref-verb' },
          el(
            'summary',
            {},
            // The *sentence*, not the question stem. A set asks the same stem
            // over and over ("Wat hutt Dir héieren?"), so summarising by stem
            // gave eight identical rows and no way to tell which miss was
            // which. The transcript is what distinguishes them, and it is what
            // the learner is here to re-read.
            el('span', { class: 'card__title' }, `${miss.n}. ${snippet(miss.transcript)}`),
          ),
          el(
            'div',
            { style: { paddingBlockStart: 'var(--s2)' } },
            el('p', { class: 'card__note' }, miss.question_lb ?? miss.question),
            miss.question_lb ? el('p', { class: 'card__note' }, miss.question) : null,
            el('p', { class: 'card__note', style: { marginBlockStart: 'var(--s2)' } }, 'You chose'),
            el('p', { class: 'miss__wrong' }, miss.chose),
            el('p', { class: 'card__note', style: { marginBlockStart: 'var(--s2)' } }, 'The answer'),
            el('p', { class: 'miss__right' }, miss.right),
            el('p', { class: 'transcript', style: { marginBlockStart: 'var(--s3)' } }, miss.transcript),
          ),
        ),
      ),
    ),
  );
}

/**
 * Renders the transcript. Gap-fill questions hide one word until answered —
 * the full sentence is what is stored in the file, so the validator always saw
 * real text and the blanking happens only here.
 */
function renderTranscript(node, question, revealed) {
  const words = question.transcript.match(/[\p{L}][\p{L}'’-]*|[^\p{L}\s]+|\s+/gu) ?? [question.transcript];
  if (question.kind !== 'gap-fill' || question.gapIndex === undefined) {
    node.textContent = question.transcript;
    return;
  }

  let wordCursor = -1;
  fill(
    node,
    ...words.map((token) => {
      if (!/^[\p{L}]/u.test(token)) return document.createTextNode(token);
      wordCursor += 1;
      if (wordCursor !== question.gapIndex) return document.createTextNode(token);
      return revealed
        ? el('strong', { class: 'transcript__fill' }, token)
        : el('span', { class: 'transcript__gap', 'aria-label': 'missing word' }, ' ');
    }),
  );
}
