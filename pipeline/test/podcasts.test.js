'use strict';

/**
 * The podcast index — level ordering, the two filters, and "have I passed it".
 *
 * The catalogue is 200 episodes fetched from a live feed, so none of this can
 * be asserted against the shipped file without the tests failing every time
 * INLL publishes. The sorting and filtering rules are pure functions and are
 * tested against fixtures here; `app-walkthrough.js` drives the real screen
 * against its own three-episode fixture.
 *
 * One real-data check does run, against whatever `podcasts.json` currently
 * holds: that every level label the feed uses is one the CEFR ordering knows
 * about. That is the assertion that catches INLL inventing a new label, which
 * is the only way this ordering can silently go back to being arbitrary.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'app', 'data', 'podcasts.json');

let screen;
test.before(async () => {
  screen = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'screens', 'podcasts.js')).href);
});

const episode = (overrides) => ({
  id: 'pod-1',
  level: 'A2',
  episodeTitle: 'An episode',
  publishedAt: '2026-05-01',
  hasTranscript: true,
  ...overrides,
});

/* ------------------------------------------------------------------ bands */

test('podcasts: a hyphenated level belongs to both of its bands', () => {
  // INLL labels some episodes "A2-B1". Those are genuinely useful at either
  // level, so they answer to either filter rather than needing a third chip.
  assert.deepEqual(screen.bandsOf('A2-B1'), ['A2', 'B1']);
  assert.deepEqual(screen.bandsOf('A2'), ['A2']);
  assert.deepEqual(screen.bandsOf(null), []);
  assert.deepEqual(screen.bandsOf(undefined), []);
});

test('podcasts: the chips are the bands actually present, in CEFR order', () => {
  const bands = screen.bandsPresent([
    episode({ level: 'B1' }),
    episode({ level: 'A1' }),
    episode({ level: 'A2-B1' }),
    episode({ level: null }),
  ]);
  assert.deepEqual(bands, ['A1', 'A2', 'B1']);
});

/* ------------------------------------------------------------- level order */

test('podcasts: sections come out in CEFR order, not feed order', () => {
  // The bug this guards: grouping by first appearance meant the headings came
  // out however INLL happened to publish, so B1 routinely sat above A1.
  const groups = screen.groupByLevel([
    episode({ id: 'a', level: 'B1' }),
    episode({ id: 'b', level: 'A1' }),
    episode({ id: 'c', level: 'A2' }),
    episode({ id: 'd', level: 'A2-B1' }),
    episode({ id: 'e', level: null }),
  ]);
  assert.deepEqual(groups.map((group) => group.level), ['A1', 'A2', 'A2-B1', 'B1', 'Unlabelled']);
});

test('podcasts: newest first inside a level', () => {
  const [group] = screen.groupByLevel([
    episode({ id: 'old', publishedAt: '2026-01-01' }),
    episode({ id: 'new', publishedAt: '2026-06-01' }),
    episode({ id: 'mid', publishedAt: '2026-03-01' }),
  ]);
  assert.deepEqual(group.episodes.map((item) => item.id), ['new', 'mid', 'old']);
});

test('podcasts: an episode with no publish date still sorts rather than throwing', () => {
  const [group] = screen.groupByLevel([episode({ id: 'dated', publishedAt: '2026-01-01' }), episode({ id: 'undated', publishedAt: null })]);
  assert.equal(group.episodes.length, 2);
});

/* ---------------------------------------------------------------- scoring */

test('podcasts: a pass is read off the attempt log, no new storage', () => {
  const attempts = [
    { topic: 'podcast', playerId: 'diego', itemId: 'pod-1', correct: 8, total: 10 },
    { topic: 'podcast', playerId: 'diego', itemId: 'pod-2', correct: 2, total: 10 },
  ];
  const scores = screen.episodeScores(attempts, 'diego');
  assert.equal(scores.get('pod-1').passed, true);
  assert.equal(scores.get('pod-2').passed, false);
  assert.equal(scores.get('pod-2').correct, 2);
});

test('podcasts: the best attempt wins, so a worse re-listen cannot un-pass an episode', () => {
  const attempts = [
    { topic: 'podcast', playerId: 'diego', itemId: 'pod-1', correct: 9, total: 10 },
    { topic: 'podcast', playerId: 'diego', itemId: 'pod-1', correct: 3, total: 10 },
  ];
  const scores = screen.episodeScores(attempts, 'diego');
  assert.equal(scores.get('pod-1').correct, 9);
  assert.equal(scores.get('pod-1').passed, true);
});

test('podcasts: another player’s attempts, and non-podcast attempts, are ignored', () => {
  const attempts = [
    { topic: 'podcast', playerId: 'amelie', itemId: 'pod-1', correct: 10, total: 10 },
    { topic: 'transport', playerId: 'diego', itemId: 'pod-1', correct: 10, total: 10 },
    { topic: 'podcast', playerId: 'diego', itemId: 'pod-9', correct: 0, total: 0 },
  ];
  const scores = screen.episodeScores(attempts, 'diego');
  assert.equal(scores.has('pod-1'), false, 'this is not Diego’s pass to claim');
  assert.equal(scores.has('pod-9'), false, 'a zero-question attempt is not a score');
});

/* ---------------------------------------------------------------- filters */

const catalogue = [
  episode({ id: 'a1', level: 'A1', hasTranscript: true }),
  episode({ id: 'a2', level: 'A2', hasTranscript: false }),
  episode({ id: 'a2b1', level: 'A2-B1', hasTranscript: true }),
  episode({ id: 'b1', level: 'B1', hasTranscript: true }),
];

test('podcasts: the level filter accepts a hyphenated episode from either side', () => {
  const pick = (band) => screen.filterEpisodes(catalogue, { band }).map((item) => item.id);
  assert.deepEqual(pick('A2'), ['a2', 'a2b1']);
  assert.deepEqual(pick('B1'), ['a2b1', 'b1']);
  assert.deepEqual(pick(null), ['a1', 'a2', 'a2b1', 'b1'], 'no band means no level filtering');
});

test('podcasts: "with questions" drops the listen-only episodes', () => {
  const ids = screen.filterEpisodes(catalogue, { questionsOnly: true }).map((item) => item.id);
  assert.deepEqual(ids, ['a1', 'a2b1', 'b1']);
});

test('podcasts: an episode with no hasTranscript field is not treated as listen-only', () => {
  // An index built before the field existed leaves it undefined, which is
  // unknown rather than absent — dropping those would hide real episodes.
  const unknown = [episode({ id: 'legacy', hasTranscript: undefined })];
  assert.equal(screen.filterEpisodes(unknown, { questionsOnly: true }).length, 1);
});

test('podcasts: "hide passed" only hides an actual pass, not every attempt', () => {
  const scores = screen.episodeScores(
    [
      { topic: 'podcast', playerId: 'diego', itemId: 'a1', correct: 9, total: 10 },
      { topic: 'podcast', playerId: 'diego', itemId: 'b1', correct: 1, total: 10 },
    ],
    'diego',
  );
  const ids = screen.filterEpisodes(catalogue, { hidePassed: true, scores }).map((item) => item.id);
  assert.deepEqual(ids, ['a2', 'a2b1', 'b1'], 'the failed episode stays — it still needs doing');
});

test('podcasts: the filters compose', () => {
  const scores = screen.episodeScores([{ topic: 'podcast', playerId: 'diego', itemId: 'b1', correct: 10, total: 10 }], 'diego');
  const ids = screen.filterEpisodes(catalogue, { band: 'B1', questionsOnly: true, hidePassed: true, scores }).map((item) => item.id);
  assert.deepEqual(ids, ['a2b1']);
});

/* -------------------------------------------------- the real catalogue */

test('podcasts: every level the live feed uses is one the CEFR ordering knows', (t) => {
  if (!fs.existsSync(DATA)) return t.skip('no podcasts.json — run npm run fetch:podcasts');
  const items = JSON.parse(fs.readFileSync(DATA, 'utf8')).items ?? [];
  if (items.length === 0) return t.skip('empty podcast index');

  const unknown = new Set();
  for (const item of items) {
    if (item.level == null) continue; // grouped under "Unlabelled" on purpose
    if (screen.levelRank(item.level) === screen.levelRank('__nope__')) unknown.add(item.level);
  }
  assert.deepEqual(
    [...unknown],
    [],
    'INLL is using a level label the ordering does not know, so it would sort to the bottom — add it to LEVEL_ORDER',
  );

  // And the grouping really does cover the whole catalogue.
  const grouped = screen.groupByLevel(items).reduce((sum, group) => sum + group.episodes.length, 0);
  assert.equal(grouped, items.length, 'grouping dropped episodes');
});
