/**
 * Schwätzen — the A2 speaking part, in the shape the exam uses.
 *
 * 2a Interview: the examiners offer two topics, you pick one, then answer
 *    their questions. Here you get a 30 second prep timer and the questions
 *    arrive one at a time, which is what makes it feel like the room.
 * 2b Image description: three images are offered, you pick one and describe it.
 *
 * The recording goes to your partner, who scores it on the official grid. The
 * machine never scores it — the peer score is the score of record.
 */

import { el, fill, screenHead, button, formatClock } from '../dom.js';
import { Amelie, AMELIE_LINES } from '../amelie.js';
import { interviewForTopic, loadInterviews, loadImages, topicIcon, modelInterviewsForTopic, loadModelAnswers } from '../content.js';
import { Recorder, isSupported, unsupportedReason } from '../recorder.js';
import { saveRecording, touchStreak, otherPlayer, POINTS } from '../store.js';

const PREP_SECONDS = 30;
const MAX_MS = 5 * 60 * 1000;

export async function render(root, { params, settings, navigate }) {
  const topicId = params[0] ?? null;
  const mode = params[1] ?? null;

  if (!topicId) return renderChooser(root, { settings, navigate });
  if (mode === 'image') return renderImageTask(root, { topicId, settings, navigate });
  return renderInterview(root, { topicId, settings, navigate });
}

/* ------------------------------------------------- the two-topic offer (2a) */

async function renderChooser(root, { settings, navigate }) {
  const interviews = await loadInterviews();
  // The exam offers exactly two topics and you pick one. Same here.
  const offered = pickTwo(interviews);

  const amelie = new Amelie({ size: 'md', bubble: true });
  amelie.say('The examiners offer two topics and you choose one. Pick the one you can say most about.', 'idle');

  root.append(
    screenHead({ title: 'Speaking', sub: 'Part 2a · interview · A2', back: '#/journey' }),
    el('div', { class: 'card' }, amelie.el),
    el(
      'div',
      { class: 'stack', style: { marginBlockStart: 'var(--s4)' } },
      ...offered.map((item) =>
        el(
          'a',
          { class: 'card', href: `#/speaking/${item.topic}`, style: { display: 'block', textDecoration: 'none', color: 'inherit' } },
          el('div', { class: 'row' }, el('span', { style: { fontSize: '28px' } }, topicIcon(item.topic)), el(
            'div',
            {},
            el('p', { class: 'card__title' }, item.title_lb),
            el('p', { class: 'card__note' }, `${item.title_en} · ${item.phases.reduce((n, p) => n + p.questions.length, 0)} questions`),
          )),
        ),
      ),
      el('div', { class: 'row', style: { justifyContent: 'center', marginBlockStart: 'var(--s3)' } },
        button('Offer two different topics', { variant: 'ghost', onclick: () => navigate('#/speaking') })),
      el(
        'a',
        { class: 'card', href: '#/speaking/image/image', style: { display: 'block', textDecoration: 'none', color: 'inherit' } },
        el('p', { class: 'card__title' }, 'Part 2b · describe an image'),
        el('p', { class: 'card__note' }, 'Three images are offered, you describe one.'),
      ),
    ),
  );
  return { destroy() {} };
}

function pickTwo(items) {
  const shuffled = [...items].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 2);
}

/* ------------------------------------------------------------- interview */

async function renderInterview(root, { topicId, settings, navigate }) {
  const item = await interviewForTopic(topicId);
  if (!item) {
    root.append(screenHead({ title: 'Speaking', back: '#/speaking' }), el('div', { class: 'empty' }, el('p', {}, 'No interview set for that topic yet.')));
    return { destroy() {} };
  }

  const questions = item.phases.flatMap((phase) => phase.questions.map((question) => ({ ...question, phase })));
  const modelEntries = await modelInterviewsForTopic(item.topic);
  return runSpeakingTask(root, {
    settings,
    navigate,
    kind: 'interview',
    topic: item.topic,
    title: item.title_lb,
    sub: `${item.title_en} · part 2a · A2`,
    questions,
    prepLine: AMELIE_LINES.interviewPrep,
    modelAnswers: modelEntries.length > 0 ? { kind: 'interview', entries: modelEntries } : null,
    stage: (question) =>
      el(
        'div',
        { class: 'stack' },
        el('p', { class: 'screen__sub' }, question.phase.title_en),
        el('p', { class: 'card__title', style: { fontSize: 'var(--size-lg)', lineHeight: 'var(--lh-snug)' } }, question.prompt_lb),
        el('p', { class: 'source-note' }, question.phase.hint_en),
      ),
  });
}

/* ------------------------------------------------------ image description */

async function renderImageTask(root, { settings, navigate }) {
  const images = await loadImages();

  if (images.length === 0) {
    const amelie = new Amelie({ size: 'md', bubble: true });
    amelie.say('No images are loaded yet. You can still practise with the official examples.', 'encouraging');
    root.append(
      screenHead({ title: 'Describe an image', sub: 'Part 2b · A2', back: '#/speaking' }),
      el('div', { class: 'card' }, amelie.el),
      el(
        'div',
        { class: 'empty' },
        el('p', {}, 'INLL’s exam images are copyrighted, so they are not bundled here.'),
        el(
          'p',
          { class: 'source-note' },
          'Open the official examples on ',
          el('a', { href: 'https://www.inll.lu/fr/sproochentest/', target: '_blank', rel: 'noopener' }, 'inll.lu'),
          ', or drop openly licensed photos into app/data/images.json to practise offline.',
        ),
      ),
    );
    return { destroy() {} };
  }

  // The exam offers three images and you pick one.
  const offered = [...images].sort(() => Math.random() - 0.5).slice(0, 3);
  let chosen = null;

  const amelie = new Amelie({ size: 'md', bubble: true });
  amelie.say(AMELIE_LINES.imagePick, 'idle');

  const grid = el(
    'div',
    { class: 'stack' },
    ...offered.map((image) =>
      el(
        'button',
        {
          type: 'button',
          class: 'card',
          style: { padding: 0, overflow: 'hidden' },
          onclick: () => {
            chosen = image;
            start();
          },
        },
        el('img', { src: image.imageUrl, alt: image.title_en ?? 'Exam image', loading: 'lazy', style: { width: '100%' } }),
        el('p', { class: 'source-note', style: { padding: 'var(--s2) var(--s3)' } }, `${image.imageCredit ?? ''} · ${image.imageLicence ?? ''}`),
      ),
    ),
  );

  const body = el('div', { class: 'stack stack--lg' }, el('div', { class: 'card' }, amelie.el), grid);
  root.append(screenHead({ title: 'Describe an image', sub: 'Part 2b · A2', back: '#/speaking' }), body);

  async function start() {
    fill(body);
    const { imageDescriptions } = await loadModelAnswers();
    const example = imageDescriptions.length > 0 ? imageDescriptions[Math.floor(Math.random() * imageDescriptions.length)] : null;
    runSpeakingTask(body, {
      settings,
      navigate,
      kind: 'image',
      topic: 'image',
      title: 'Describe this image',
      sub: 'Part 2b · A2',
      questions: [{ id: chosen.id, prompt_lb: null }],
      prepLine: 'Look at the image for 30 seconds. Plan what is where, who is doing what.',
      modelAnswers: example ? { kind: 'image', example } : null,
      stage: () => el('img', { src: chosen.imageUrl, alt: chosen.title_en ?? 'Exam image', style: { width: '100%', borderRadius: 'var(--r-lg)' } }),
    });
  }

  return { destroy() {} };
}

/* ------------------------------------------------------- the shared runner */

/**
 * Prep timer → record → save. Shared by 2a and 2b because the exam treats them
 * the same way: pick, think briefly, then talk for up to five minutes.
 */
function runSpeakingTask(root, { settings, navigate, kind, topic, title, sub, questions, prepLine, stage, modelAnswers }) {
  const amelie = new Amelie({ size: 'sm', bubble: true });
  const body = el('div', { class: 'stack stack--lg' });
  let recorder = null;
  let questionIndex = 0;

  if (root.querySelector('.screen__head') === null && root.id === 'screen') {
    root.append(screenHead({ title, sub, back: '#/speaking' }));
  }
  root.append(body);

  const blocked = isSupported() ? null : unsupportedReason();
  if (blocked) {
    fill(
      body,
      el('div', { class: 'card' }, amelie.el),
      el('div', { class: 'empty' }, el('p', {}, blocked), el('p', { class: 'source-note' }, 'You can still read the questions aloud and score yourself later.')),
      stage(questions[0]),
    );
    amelie.say(blocked, 'encouraging');
    return { destroy() {} };
  }

  /* --- phase 1: prep timer */
  let prepLeft = PREP_SECONDS;
  const prepClock = el('p', { class: 'timer' }, `0:${String(PREP_SECONDS).padStart(2, '0')}`);
  amelie.say(prepLine, 'thinking');

  const prepTimer = window.setInterval(() => {
    prepLeft -= 1;
    prepClock.textContent = `0:${String(Math.max(0, prepLeft)).padStart(2, '0')}`;
    prepClock.classList.toggle('is-low', prepLeft <= 5);
    if (prepLeft <= 0) {
      window.clearInterval(prepTimer);
      beginRecording();
    }
  }, 1000);

  fill(
    body,
    stage(questions[0]),
    el(
      'div',
      { class: 'card', style: { textAlign: 'center' } },
      el('p', { class: 'meter__label' }, 'Preparation'),
      prepClock,
      button('Start now', { variant: 'secondary', onclick: () => { window.clearInterval(prepTimer); beginRecording(); } }),
    ),
    amelie.el,
    modelAnswers ? modelAnswerBlock(modelAnswers) : null,
  );

  /* --- phase 2: recording, questions revealed one at a time */
  function beginRecording() {
    const clock = el('p', { class: 'timer' }, '0:00');
    const stageWrap = el('div', {}, stage(questions[questionIndex]));

    const nextQuestion = button('Next question', {
      variant: 'secondary',
      hidden: questions.length < 2,
      onclick: () => {
        questionIndex = Math.min(questionIndex + 1, questions.length - 1);
        fill(stageWrap, stage(questions[questionIndex]));
        counter.textContent = `${questionIndex + 1} / ${questions.length}`;
        if (questionIndex === questions.length - 1) nextQuestion.disabled = true;
      },
    });

    const counter = el('span', { class: 'chip' }, `1 / ${questions.length}`);

    const stopButton = el(
      'button',
      {
        type: 'button',
        class: 'btn btn--record is-recording',
        'aria-label': 'Stop recording',
        onclick: () => recorder?.stop(),
      },
      el('svg', { viewBox: '0 0 24 24', width: '30', height: '30', 'aria-hidden': 'true', fill: 'currentColor' }, el('rect', { x: '6', y: '6', width: '12', height: '12', rx: '2' })),
    );

    recorder = new Recorder({
      maxMs: MAX_MS,
      onTick: (ms) => {
        clock.textContent = formatClock(ms);
        clock.classList.toggle('is-low', ms > MAX_MS - 30000);
      },
      onStop: async ({ blob, mime, durationMs }) => {
        const record = await saveRecording({
          playerId: settings.playerId,
          kind,
          topic,
          blob,
          mime,
          durationMs,
          prompts: questions.slice(0, questionIndex + 1).map((question) => question.prompt_lb).filter(Boolean),
        });
        await touchStreak(settings.playerId);
        showDone(record, durationMs);
      },
    });

    recorder.start().then(
      () => amelie.say(AMELIE_LINES.interviewGo, 'listening'),
      (error) => {
        fill(body, el('div', { class: 'empty' }, el('p', {}, error.message), button('Back', { variant: 'secondary', onclick: () => navigate('#/speaking') })));
      },
    );

    fill(
      body,
      el('div', { class: 'row row--between' }, counter, el('span', { class: 'chip chip--warn' }, 'Recording')),
      stageWrap,
      el('div', { class: 'row', style: { justifyContent: 'center' } }, nextQuestion),
      amelie.el,
      el('div', { class: 'stack', style: { alignItems: 'center' } }, clock, stopButton, el('p', { class: 'source-note' }, 'Up to five minutes. Stop when you are done.')),
    );
  }

  /* --- phase 3: handed to the partner */
  function showDone(record, durationMs) {
    const partner = otherPlayer(settings.playerId);
    const done = new Amelie({ size: 'lg', bubble: true });
    done.el.classList.add('amelie--stack', 'amelie--hero');
    done.celebrate(AMELIE_LINES.interviewDone);

    const audio = el('audio', { controls: '', src: URL.createObjectURL(record.blob), style: { width: '100%' } });

    fill(
      body,
      el(
        'div',
        { class: 'stack stack--lg', style: { paddingBlockStart: 'var(--s5)' } },
        done.el,
        el(
          'div',
          { class: 'card' },
          el('p', { class: 'meter__label' }, 'Your answer'),
          el('p', { class: 'card__note' }, `${formatClock(durationMs)} · +${POINTS.perRecording} points`),
          audio,
        ),
        el('p', { class: 'source-note' }, `${partner.name} scores this on the official grid: four criteria, 0 to 5 each. That score is the one that counts.`),
        button('Record another', { variant: 'secondary', class: 'btn btn--secondary btn--block', onclick: () => navigate('#/speaking') }),
        button('See readiness', { variant: 'primary', class: 'btn btn--primary btn--block', onclick: () => navigate('#/readiness') }),
      ),
    );
  }

  return {
    destroy() {
      window.clearInterval(prepTimer);
      recorder?.destroy();
    },
  };
}

/**
 * Collapsed by default so it never spoils prep unless you open it. Content
 * here is hand-authored study notes the user supplied, not LOD-validated like
 * the rest of the app's Luxembourgish — the disclaimer says so plainly.
 */
function modelAnswerBlock(modelAnswers) {
  const body =
    modelAnswers.kind === 'interview'
      ? modelAnswers.entries.map((entry) =>
          el(
            'div',
            { class: 'stack', style: { marginBlockStart: 'var(--s3)' } },
            el('p', { class: 'card__title', style: { fontSize: 'var(--size-sm)' } }, entry.title_en),
            ...entry.questions.map((question) =>
              el(
                'div',
                { class: 'stack', style: { gap: 'var(--s1)' } },
                el('p', { style: { fontWeight: '650' } }, question.lb),
                ...question.answers_lb.map((answer) => el('p', { class: 'card__note' }, answer)),
              ),
            ),
          ),
        )
      : [el('p', {}, modelAnswers.example.text_lb)];

  return el(
    'details',
    { class: 'card card--flat', style: { marginBlockStart: 'var(--s3)' } },
    el('summary', { class: 'card__title' }, 'See a model answer'),
    el(
      'div',
      { class: 'stack', style: { marginBlockStart: 'var(--s3)' } },
      el('p', { class: 'source-note' }, 'Study notes provided by the user — not checked against the LOD corpus like the rest of this app. Read for structure and vocabulary, not as an official reference.'),
      ...body,
    ),
  );
}
