'use strict';

/**
 * The podcast index — feed parsing, and the guard on what it is allowed to ship.
 *
 * The second half matters more than the first. `content/external/podcasts.json`
 * sits outside `pipeline/validate.js`, and the justification for that is narrow:
 * not "this content is exempt from the gate" but "there is no content here —
 * it is a bibliography". These tests hold that line. If someone later adds a
 * transcript, a Luxembourgish field or a corpus audio id to this file, the
 * justification evaporates and the build should say so.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const podcasts = require('../fetch-podcasts.js');

/* ------------------------------------------------------------- parsing */

test('podcasts: the level tag is read from the end of the title, not the middle', () => {
  assert.equal(podcasts.levelFromTitle('Transportmëttel a Fürerschäin (A2)'), 'A2');
  assert.equal(podcasts.levelFromTitle('Iwwer Ernärungstrends schwätzen (B1)'), 'B1');
  assert.equal(podcasts.levelFromTitle('Sech am INLL umellen (A2-B1)'), 'A2-B1');
  assert.equal(podcasts.levelFromTitle('Sech am INLL umellen ( a2 - b1 )'), 'A2-B1');

  // A level named anywhere else is a topic, not a marker. Guessing from it
  // would file episodes under the wrong difficulty.
  assert.equal(podcasts.levelFromTitle('Wat heescht B1 iwwerhaapt?'), null);
  assert.equal(podcasts.levelFromTitle('No marker at all'), null);
});

test('podcasts: durations parse in all three shapes feeds use', () => {
  assert.equal(podcasts.durationSeconds('512'), 512);
  assert.equal(podcasts.durationSeconds('8:32'), 512);
  assert.equal(podcasts.durationSeconds('1:08:32'), 4112);
  assert.equal(podcasts.durationSeconds(null), null);
  assert.equal(podcasts.durationSeconds('not a time'), null);
});

test('podcasts: an episode with no playable enclosure is dropped, not shipped broken', () => {
  const xml = `<rss><channel>
    <item><title>Good (A2)</title><guid>a</guid>
      <enclosure url="https://cdn.example/a.mp3" type="audio/mpeg"/></item>
    <item><title>No enclosure</title><guid>b</guid></item>
    <item><title>Insecure</title><guid>c</guid>
      <enclosure url="http://cdn.example/c.mp3" type="audio/mpeg"/></item>
  </channel></rss>`;
  const items = podcasts.parseFeed(xml);
  assert.equal(items.length, 1, 'only the https row with an enclosure is usable');
  assert.equal(items[0].level, 'A2');
});

test('podcasts: CDATA titles and namespaced tags survive the reader', () => {
  // lib/xml.js would throw on both — it is a strict reader for LOD's machine
  // output. This is why the fetcher has its own.
  const xml = `<rss><channel><item>
    <title><![CDATA[Fürerschäin & Zuch (A2)]]></title>
    <guid>x</guid>
    <itunes:duration>08:32</itunes:duration>
    <enclosure url="https://cdn.example/x.mp3" type="audio/mpeg"/>
    <podcast:transcript url="https://cdn.example/x.vtt" type="text/vtt"/>
  </item></channel></rss>`;
  const [episode] = podcasts.parseFeed(xml);
  assert.equal(episode.episodeTitle, 'Fürerschäin & Zuch (A2)');
  assert.equal(episode.durationSec, 512);
  assert.equal(episode.transcriptUrl, 'https://cdn.example/x.vtt');
});

test('podcasts: a plain-text transcript is preferred over other formats', () => {
  // The Worker feeds this straight to a model; plain text costs the fewest
  // tokens and needs no stripping.
  const xml = `<rss><channel><item>
    <title>T (B1)</title><guid>y</guid>
    <enclosure url="https://cdn.example/y.mp3" type="audio/mpeg"/>
    <podcast:transcript url="https://cdn.example/y.html" type="text/html"/>
    <podcast:transcript url="https://cdn.example/y.txt" type="text/plain"/>
  </item></channel></rss>`;
  const [episode] = podcasts.parseFeed(xml);
  assert.equal(episode.transcriptUrl, 'https://cdn.example/y.txt');
});

test('podcasts: a transcript is detected by either route, and only ever as a boolean', () => {
  // INLL uses neither <podcast:transcript> nor a uniform layout: about half
  // its episodes paste the transcript into <description> after "Transkript:".
  // Both routes have to count, or half the catalogue is wrongly marked
  // unanswerable.
  const xml = `<rss><channel>
    <item><title>Tagged (A2)</title><guid>a</guid>
      <enclosure url="https://cdn.example/a.mp3" type="audio/mpeg"/>
      <podcast:transcript url="https://cdn.example/a.txt" type="text/plain"/></item>
    <item><title>Embedded (A2)</title><guid>b</guid>
      <description><![CDATA[<p>Intro</p><p>Transkript:</p><p>A: Moien!</p>]]></description>
      <enclosure url="https://cdn.example/b.mp3" type="audio/mpeg"/></item>
    <item><title>Neither (A2)</title><guid>c</guid>
      <description><![CDATA[<p>Just a summary of the episode.</p>]]></description>
      <enclosure url="https://cdn.example/c.mp3" type="audio/mpeg"/></item>
  </channel></rss>`;
  const [tagged, embedded, neither] = podcasts.parseFeed(xml);

  assert.equal(tagged.hasTranscript, true, 'a <podcast:transcript> url counts');
  assert.equal(embedded.hasTranscript, true, 'a "Transkript:" marker in the description counts');
  assert.equal(neither.hasTranscript, false, 'no marker and no tag is a definite no');

  // The point of the flag is to answer the question without carrying the
  // answer's content. A string here would be transcript text smuggled into a
  // file that promises metadata only.
  for (const episode of [tagged, embedded, neither]) {
    assert.equal(typeof episode.hasTranscript, 'boolean', `${episode.episodeTitle}: the flag is a boolean, never the text`);
  }
});

/* ------------------------------------------------- the shipped-file guard */

const SHIPPED = path.join(ROOT, 'app', 'data', 'podcasts.json');

test('podcasts: the shipped index carries metadata only, never content', (t) => {
  if (!fs.existsSync(SHIPPED)) {
    t.skip('no podcasts.json yet — run npm run fetch:podcasts');
    return;
  }
  const file = JSON.parse(fs.readFileSync(SHIPPED, 'utf8'));

  const walk = (node, at) => {
    if (Array.isArray(node)) return node.forEach((entry, index) => walk(entry, `${at}[${index}]`));
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      // A transcript here would be redistribution of copyrighted text, and a
      // `_lb` field would be unvalidated Luxembourgish outside the gate.
      assert.notEqual(key, 'transcript', `${at}.${key}: transcript text must never be stored`);
      assert.ok(!key.endsWith('_lb'), `${at}.${key}: Luxembourgish fields belong in content/items/, behind the validator`);
      // `audioId` resolves against the LOD corpus; an external episode has no
      // business claiming one.
      assert.notEqual(key, 'audioId', `${at}.${key}: external audio is a URL, not a corpus id`);
      walk(value, `${at}.${key}`);
    }
  };
  walk(file.items ?? [], 'items');

  for (const episode of file.items ?? []) {
    assert.ok(/^https:\/\//.test(episode.audioSrc), `${episode.id}: audioSrc must be an absolute https URL`);
    // A relative path would mean a file got mirrored into the repo.
    assert.ok(!episode.audioSrc.startsWith('assets/'), `${episode.id}: episode audio must not be mirrored`);
    assert.ok(episode.attribution && episode.licence, `${episode.id}: every row states who owns it`);
    // The flag records whether a transcript exists, never any of its text.
    assert.equal(typeof episode.hasTranscript, 'boolean', `${episode.id}: hasTranscript must stay a boolean`);
  }
});

test('podcasts: no episode audio is precached by the service worker', () => {
  // Streaming is the licence position *and* the storage position: the precache
  // is already 66 MB of LOD clips, and episodes are minutes rather than
  // seconds. sw.js returns early for cross-origin requests, so this holds by
  // construction — the test is here so a future change to that line is noticed.
  const sw = fs.readFileSync(path.join(ROOT, 'app', 'sw.js'), 'utf8');
  assert.ok(
    sw.includes('if (url.origin !== self.location.origin) return;'),
    'sw.js must keep returning early for cross-origin requests, or streamed episodes would be cached',
  );
  assert.ok(!/podcast.*\.mp3|assets\/podcast/i.test(sw), 'sw.js must not precache episode audio');
});
