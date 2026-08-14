/**
 * Poterkëscht — the INLL podcast, with questions afterwards.
 *
 * Everything the Verstoen module drills is one LOD example sentence: a single
 * utterance, read carefully by a dictionary voice. The README is honest that
 * these are "corpus-derived drills on the official 5+7+4 shape, not replicas of
 * INLL's connected-speech test". The real B1 paper is minutes of connected
 * speech, and INLL publishes exactly that — weekly, free, with the CEFR level
 * in each episode title.
 *
 * Two rules govern this screen, and both are older than it.
 *
 * **Stream, never store.** The podcast carries no published licence and this
 * repository is public, so the safe reading is all rights reserved. README.md
 * already settles the identical case for RTL.lu audio: "Link and stream, do not
 * mirror." Nothing is downloaded, nothing is cached — the service worker
 * ignores cross-origin requests, so that holds without any code here. The cost
 * is that this one section needs signal, and the screen says so rather than
 * handing you a button that fails.
 *
 * **Nothing authors Luxembourgish.** The questions come from Claude at runtime,
 * but the model writes only the English stem: every option is a span quoted
 * verbatim from the transcript, and the Worker discards any that is not
 * literally there before it caches anything. So the Luxembourgish on this
 * screen is exactly what INLL said, which is the same standard the corpus-built
 * decks hold themselves to — a different source, the same rule.
 */

import { el, fill, screenHead, button, plural, formatPercent } from '../dom.js';
import { Amelie, AMELIE_LINES, pickLine } from '../amelie.js';
import { Clip } from '../audio.js';
import { chimeCorrect, resetChimeStreak } from '../chime.js';
import { loadPodcasts, podcastEpisode } from '../content.js';
import { requestEpisodeQuestions } from '../sync.js';
import { saveAttempt, touchStreak, weekSeed, setVerdict, POINTS, attemptsFor, saveSettings } from '../store.js';

export async function render(root, { params, settings, navigate }) {
  const id = params?.[0] ?? null;
  return id ? renderEpisode(root, id, { settings, navigate }) : renderIndex(root, { settings, navigate });
}

/* ----------------------------------------------------------------- index */

/**
 * CEFR order, which is not the order the feed arrives in.
 *
 * The index used to group by `level` in first-appearance order, so the
 * headings came out however INLL happened to publish that month — B1 above A2
 * above A1 was normal. With 200 episodes in the catalogue that is not a
 * cosmetic problem: the first thing an A1 learner scrolled past was whatever
 * shipped most recently.
 *
 * The hyphenated labels are INLL's own ("A2-B1"), not something split here.
 */
const LEVEL_ORDER = ['A1', 'A1-A2', 'A2', 'A2-B1', 'B1', 'B1-B2', 'B2'];
const UNLABELLED = 'Unlabelled';

/** The CEFR bands a level label covers. "A2-B1" is genuinely both, so it
 * answers to either filter rather than to a third chip of its own. */
export function bandsOf(level) {
  return [...String(level ?? '').matchAll(/[ABC][12]/g)].map((match) => match[0]);
}

/** Sorts a level label into CEFR order; anything unrecognised sorts last. */
export function levelRank(level) {
  const index = LEVEL_ORDER.indexOf(level);
  return index === -1 ? LEVEL_ORDER.length : index;
}

/** Every band present in the catalogue, in CEFR order — the filter chips. */
export function bandsPresent(episodes) {
  const bands = new Set();
  for (const episode of episodes ?? []) for (const band of bandsOf(episode.level)) bands.add(band);
  return [...bands].sort();
}

/**
 * Only a hard `false` counts as "no transcript": an index built before the
 * field existed leaves it undefined, and that is unknown rather than absent.
 */
const lacksTranscript = (episode) => episode.hasTranscript === false;

/**
 * Which episodes have already been passed, read off the attempt log.
 *
 * No new storage: finishing an episode's questions already writes an attempt
 * tagged `topic: 'podcast'` with the episode id, so "have I done this one"
 * is a question the existing data can answer. Keyed to the best attempt, so
 * passing once is permanent — going back and scoring worse on a re-listen
 * does not un-pass it.
 */
export function episodeScores(attempts, playerId) {
  const best = new Map();
  for (const attempt of attempts ?? []) {
    if (attempt.topic !== 'podcast' || attempt.playerId !== playerId) continue;
    if (!attempt.itemId || !attempt.total) continue;
    const pct = (attempt.correct / attempt.total) * 100;
    const previous = best.get(attempt.itemId);
    if (previous && previous.pct >= pct) continue;
    best.set(attempt.itemId, { pct, correct: attempt.correct, total: attempt.total, passed: setVerdict(pct).passed });
  }
  return best;
}

/** The filters, applied together. Pure, so the counts on screen and the rows
 * under them cannot disagree. */
export function filterEpisodes(episodes, { band, questionsOnly, hidePassed, scores }) {
  return (episodes ?? []).filter((episode) => {
    if (band && !bandsOf(episode.level).includes(band)) return false;
    if (questionsOnly && lacksTranscript(episode)) return false;
    if (hidePassed && scores?.get(episode.id)?.passed) return false;
    return true;
  });
}

/** Grouped into CEFR-ordered sections, newest episode first inside each. */
export function groupByLevel(episodes) {
  const byLevel = new Map();
  for (const episode of episodes ?? []) {
    const key = episode.level ?? UNLABELLED;
    if (!byLevel.has(key)) byLevel.set(key, []);
    byLevel.get(key).push(episode);
  }
  return [...byLevel.entries()]
    .sort(([a], [b]) => levelRank(a) - levelRank(b) || a.localeCompare(b))
    .map(([level, rows]) => ({
      level,
      episodes: [...rows].sort((a, b) => String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? ''))),
    }));
}

/** How many rows a level section shows before it needs asking. A2 alone has
 * 111 episodes; rendering every one of them is a scroll, not a list. */
const VISIBLE_PER_LEVEL = 8;

async function renderIndex(root, { settings, navigate }) {
  const [episodes, attempts] = await Promise.all([loadPodcasts(), attemptsFor(settings.playerId)]);

  root.append(
    screenHead({
      title: 'Poterkëscht',
      sub: episodes.length > 0 ? `${plural(episodes.length, 'episode')} from INLL` : 'The INLL podcast',
      back: '#/journey',
    }),
  );

  if (episodes.length === 0) {
    root.append(
      el(
        'div',
        { class: 'empty' },
        el('p', {}, 'No episodes indexed yet.'),
        el(
          'p',
          { class: 'card__note' },
          'Run npm run fetch:podcasts with the feed URL to build the index. Only episode titles and links are stored — the audio always streams from INLL.',
        ),
        button('Back', { variant: 'secondary', onclick: () => navigate('#/journey') }),
      ),
    );
    return { destroy() {} };
  }

  const scores = episodeScores(attempts, settings.playerId);
  const answerable = episodes.filter((episode) => !lacksTranscript(episode)).length;
  const passed = episodes.filter((episode) => scores.get(episode.id)?.passed).length;

  // Filter choices persist. A learner who only ever wants B1 episodes with
  // questions should not have to say so on every visit.
  let band = settings.podcastBand ?? null;
  let questionsOnly = settings.podcastQuestionsOnly ?? false;
  let hidePassed = settings.podcastHidePassed ?? false;
  // A band saved before the catalogue changed could now match nothing.
  const bands = bandsPresent(episodes);
  if (band && !bands.includes(band)) band = null;

  root.append(
    el(
      'p',
      { class: 'card__note' },
      'Real connected speech from the exam board, at natural speed — the closest thing to the B1 paper. Listen, then answer.',
    ),
    el(
      'p',
      { class: 'source-note' },
      `${answerable} of ${episodes.length} come with a transcript and can ask you questions; the rest are marked “listen only”.` +
        (passed > 0 ? ` You have passed ${passed}.` : ''),
    ),
  );

  const filters = el('div', { class: 'stack', style: { marginBlockStart: 'var(--s4)' } });
  const list = el('div');
  root.append(filters, list);

  /** A chip that reads as pressed — same shape the cheat sheet's tabs use. */
  function chip(label, active, onclick) {
    return el(
      'button',
      {
        type: 'button',
        class: `chip chip--pick${active ? ' is-picked' : ''}`,
        'aria-pressed': active ? 'true' : 'false',
        onclick,
      },
      label,
    );
  }

  function set(patch) {
    if ('band' in patch) band = patch.band;
    if ('questionsOnly' in patch) questionsOnly = patch.questionsOnly;
    if ('hidePassed' in patch) hidePassed = patch.hidePassed;
    // Remembered for next time, but the screen never waits on the write.
    saveSettings({ podcastBand: band, podcastQuestionsOnly: questionsOnly, podcastHidePassed: hidePassed });
    draw();
  }

  function draw() {
    fill(
      filters,
      el(
        'div',
        { class: 'row', style: { gap: 'var(--s2)', flexWrap: 'wrap' } },
        chip('All levels', band === null, () => set({ band: null })),
        ...bands.map((value) => chip(value, band === value, () => set({ band: value }))),
      ),
      el(
        'div',
        { class: 'row', style: { gap: 'var(--s2)', flexWrap: 'wrap' } },
        chip('With questions', questionsOnly, () => set({ questionsOnly: !questionsOnly })),
        chip('Hide passed', hidePassed, () => set({ hidePassed: !hidePassed })),
      ),
    );

    const shown = filterEpisodes(episodes, { band, questionsOnly, hidePassed, scores });
    fill(list);

    if (shown.length === 0) {
      list.append(
        el(
          'div',
          { class: 'empty' },
          el('p', {}, 'Nothing matches those filters.'),
          el('p', { class: 'card__note' }, hidePassed && passed > 0 ? 'You may have passed everything at this level — try another one.' : 'Try a different level.'),
          button('Show everything', { variant: 'secondary', onclick: () => set({ band: null, questionsOnly: false, hidePassed: false }) }),
        ),
      );
      return;
    }

    list.append(
      el('p', { class: 'source-note', style: { marginBlockStart: 'var(--s3)' } }, `Showing ${plural(shown.length, 'episode')}.`),
    );

    for (const group of groupByLevel(shown)) {
      const section = el('div', { style: { marginBlockStart: 'var(--s5)' } });
      const rows = el('div', { class: 'stack' });
      let expanded = false;

      const paint = () => {
        const visible = expanded ? group.episodes : group.episodes.slice(0, VISIBLE_PER_LEVEL);
        fill(rows, ...visible.map((episode) => episodeRow(episode, scores.get(episode.id))));
        if (group.episodes.length > VISIBLE_PER_LEVEL) {
          rows.append(
            button(expanded ? 'Show fewer' : `Show all ${group.episodes.length}`, {
              variant: 'ghost',
              class: 'btn btn--ghost btn--block',
              onclick: () => {
                expanded = !expanded;
                paint();
              },
            }),
          );
        }
      };
      paint();

      section.append(
        el(
          'div',
          { class: 'row row--between', style: { marginBlockEnd: 'var(--s2)' } },
          // The level alone in the label — the count sits beside it rather
          // than inside, so the heading stays the level and nothing else.
          el('p', { class: 'meter__label' }, group.level),
          el('span', { class: 'card__note' }, plural(group.episodes.length, 'episode')),
        ),
        rows,
      );
      list.append(section);
    }

    list.append(
      el(
        'p',
        { class: 'source-note', style: { marginBlockStart: 'var(--s5)' } },
        'Poterkëscht vum INLL, streamed from the publisher. ',
        el('a', { href: 'https://www.inll.lu/en/poterkescht-the-podcast-in-luxembourgish-from-inll/', target: '_blank', rel: 'noreferrer' }, 'inll.lu'),
      ),
    );
  }

  draw();
  return { destroy() {} };
}

function episodeRow(episode, score) {
  return el(
    'a',
    { class: 'card', href: `#/podcasts/${encodeURIComponent(episode.id)}`, style: { display: 'block' } },
    el(
      'div',
      { class: 'row' },
      el('span', { style: { fontSize: '26px' } }, score?.passed ? '✅' : '🎧'),
      el(
        'div',
        { class: 'spacer' },
        el('p', { class: 'card__title' }, episode.episodeTitle),
        el(
          'p',
          { class: 'card__note' },
          [
            episode.publishedAt,
            formatDuration(episode.durationSec),
            // What you scored, so a re-listen is a choice rather than a
            // rediscovery. Only the best attempt is kept.
            score ? `${score.correct}/${score.total}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
        ),
      ),
      // Said on the row rather than only after tapping: whether an episode can
      // be answered is a reason to pick it, so it belongs where the choice is
      // made. Listening still works on every episode.
      lacksTranscript(episode) ? el('span', { class: 'chip' }, 'listen only') : null,
      score?.passed ? el('span', { class: 'chip' }, 'passed') : null,
    ),
  );
}

function formatDuration(seconds) {
  if (!seconds) return null;
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

/* --------------------------------------------------------------- episode */

async function renderEpisode(root, id, { settings, navigate }) {
  const episode = await podcastEpisode(id);
  if (!episode) {
    root.append(
      screenHead({ title: 'Episode', back: '#/podcasts' }),
      el('div', { class: 'empty' }, el('p', {}, 'That episode is not in the index.'), button('Back', { variant: 'secondary', onclick: () => navigate('#/podcasts') })),
    );
    return { destroy() {} };
  }

  const clip = new Clip(episode.audioSrc);
  const amelie = new Amelie({ size: 'sm', bubble: true });
  const body = el('div', { class: 'stack stack--lg' });

  root.append(
    screenHead({
      title: episode.episodeTitle,
      sub: [episode.level, formatDuration(episode.durationSec)].filter(Boolean).join(' · '),
      back: '#/podcasts',
    }),
    body,
  );

  const play = button('Play', { variant: 'primary', class: 'btn btn--primary btn--block' });
  const status = el('p', { class: 'card__note', style: { textAlign: 'center' } });
  const questionHolder = el('div');

  function setStatus(text) {
    status.textContent = text;
  }

  play.addEventListener('click', async () => {
    if (clip.isPlaying) {
      clip.pause();
      play.textContent = 'Play';
      amelie.setState('idle');
      return;
    }
    setStatus('Loading…');
    const ok = await clip.play();
    if (!ok) {
      setStatus('That would not play. The episode streams from INLL — check your connection.');
      return;
    }
    play.textContent = 'Pause';
    setStatus('');
    amelie.setState('listening');
  });

  clip.on('ended', () => {
    play.textContent = 'Play again';
    amelie.setState('idle');
  });

  const offline = !navigator.onLine;
  if (offline) {
    play.disabled = true;
    setStatus('Offline. Episodes stream from INLL and are never stored on the phone, so this one needs a connection.');
  }

  amelie.say('Listen the whole way through first. You can answer afterwards.', 'idle');

  fill(
    body,
    el(
      'div',
      { class: 'card', style: { textAlign: 'center' } },
      el('p', { class: 'meter__label' }, 'Listen'),
      el('p', { style: { fontSize: '40px', marginBlock: 'var(--s3)' } }, '🎧'),
      play,
      status,
    ),
    el('div', { class: 'card' }, amelie.el),
    questionHolder,
    el(
      'p',
      { class: 'source-note' },
      `${episode.source} · ${episode.attribution}. Streamed from the publisher, not stored. `,
      el('a', { href: episode.sourceUrl, target: '_blank', rel: 'noreferrer' }, 'Episode page'),
    ),
  );

  if (lacksTranscript(episode)) {
    // No button at all. Questions are quoted verbatim from a transcript, and
    // INLL published none for this episode, so there is nothing a tap could
    // do — offering one and failing would read as a bug in the app.
    fill(
      questionHolder,
      el(
        'div',
        { class: 'card' },
        el('p', { class: 'card__title' }, 'Listening only'),
        el(
          'p',
          { class: 'card__note' },
          'INLL publishes a transcript for about half its episodes, and not for this one. Questions are quoted word for word from the transcript, so there are none here — the episode is still worth listening to.',
        ),
      ),
    );
  } else {
    const ask = button('Ask me questions', {
      variant: 'secondary',
      class: 'btn btn--secondary btn--block',
      onclick: async () => {
        ask.disabled = true;
        fill(questionHolder, el('p', { class: 'card__note', style: { textAlign: 'center' } }, 'Reading the episode…'));
        const result = await requestEpisodeQuestions(settings, episode);
        if (!result.ok) {
          fill(
            questionHolder,
            el(
              'div',
              { class: 'card' },
              el('p', { class: 'card__title' }, result.noTranscript ? 'Listening only' : 'No questions this time'),
              el('p', { class: 'card__note' }, result.message),
            ),
          );
          // A missing transcript will not become present on a retry; anything
          // else might.
          if (!result.noTranscript) ask.disabled = false;
          return;
        }
        runQuestions(questionHolder, result, { episode, settings, navigate, clip, amelie });
      },
    });
    fill(questionHolder, ask);
  }

  return {
    destroy() {
      clip.destroy();
    },
  };
}

/* ------------------------------------------------------------- questions */

/**
 * The same shape as a listening set, reusing its markup so the answered /
 * correct / wrong styling and the chime all come for free.
 */
function runQuestions(holder, { questions, via }, { episode, settings, navigate, clip, amelie }) {
  let index = 0;
  let correctCount = 0;

  const body = el('div', { class: 'stack stack--lg' });
  fill(holder, body);

  function renderOne() {
    if (index >= questions.length) return finish();

    const question = questions[index];
    let answered = false;

    const buttons = question.options_lb.map((option, position) =>
      el(
        'button',
        { type: 'button', class: 'option', onclick: () => answer(position) },
        el('span', { class: 'option__key', 'aria-hidden': 'true' }, String.fromCharCode(65 + position)),
        el('span', {}, option),
      ),
    );
    const options = el('div', { class: 'options' }, ...buttons);
    const next = button(index === questions.length - 1 ? 'Finish' : 'Next', {
      variant: 'primary',
      class: 'btn btn--primary btn--block',
      onclick: () => {
        index += 1;
        renderOne();
      },
    });
    next.hidden = true;

    function answer(chosen) {
      if (answered) return;
      answered = true;
      // Pause the episode: leaving it running while the answer is revealed
      // means the next question is playing over the feedback for this one.
      if (clip.isPlaying) clip.pause();
      options.classList.add('is-answered');
      buttons[question.correct].classList.add('is-correct');
      const right = chosen === question.correct;
      if (!right) buttons[chosen].classList.add('is-wrong');
      if (right) {
        correctCount += 1;
        chimeCorrect();
      } else {
        resetChimeStreak();
      }
      amelie.say(pickLine(right ? AMELIE_LINES.correct : AMELIE_LINES.wrong), right ? 'celebrating' : 'encouraging');
      next.hidden = false;
      next.focus();
    }

    fill(
      body,
      el(
        'div',
        { class: 'row row--between' },
        el('span', { class: 'meter__label' }, `Question ${index + 1} of ${questions.length}`),
        el('span', { class: 'chip' }, 'machine-made'),
      ),
      el('div', { class: 'card' }, el('p', { class: 'card__title' }, question.question_en)),
      options,
      next,
    );
  }

  async function finish() {
    await saveAttempt({
      playerId: settings.playerId,
      itemId: episode.id,
      // Tagged so a podcast run is identifiable in the attempt log. It still
      // counts toward the B1 listening estimate, which is the point: connected
      // speech is a truer signal for that number than the corpus drills are.
      topic: 'podcast',
      correct: correctCount,
      total: questions.length,
      weekSeed: weekSeed(),
    });
    await touchStreak(settings.playerId);

    const pct = (correctCount / questions.length) * 100;
    const verdict = setVerdict(pct);

    const done = new Amelie({ size: 'lg', bubble: true });
    done.el.classList.add('amelie--stack', 'amelie--hero');
    // Same rule as the corpus listening sets: this run is averaged into the
    // same B1 estimate, so it gets the same verdict rather than a cheer.
    if (verdict.passed) done.celebrate(verdict.line);
    else done.say('Connected speech at natural speed is the hardest input there is. Below the line here is normal — the transcript below is the way in.', 'encouraging');

    fill(
      body,
      el(
        'div',
        { class: 'stack stack--lg', style: { paddingBlockStart: 'var(--s5)' } },
        done.el,
        el(
          'div',
          { class: 'card', style: { textAlign: 'center' } },
          el('p', { class: 'meter__label' }, 'This episode'),
          el('p', { class: 'meter__value' }, `${correctCount} / ${questions.length}`),
          el(
            'div',
            { class: 'meter__track', style: { marginBlockStart: 'var(--s3)' } },
            el('div', { class: `meter__fill ${verdict.passed ? 'is-pass' : 'is-fail'}`, style: { width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` } }),
            el('span', { class: 'meter__threshold', 'aria-hidden': 'true' }),
          ),
          el(
            'p',
            { class: 'card__note', style: { marginBlockStart: 'var(--s2)' } },
            `${formatPercent(pct)} · ${verdict.label} · +${correctCount * POINTS.perCorrectAnswer} points`,
          ),
        ),
        button('Another episode', { variant: 'primary', class: 'btn btn--primary btn--block', onclick: () => navigate('#/podcasts') }),
        el(
          'p',
          { class: 'source-note' },
          via === 'whisper'
            ? 'Questions written from an automatic transcription of the episode. Luxembourgish speech recognition is poor, so treat a strange-looking option as a transcription slip rather than as something you misheard.'
            : 'Questions written from the episode transcript INLL publishes. Every option is quoted from it word for word.',
        ),
      ),
    );
  }

  renderOne();
}
