#!/usr/bin/env node
'use strict';

/**
 * Indexes the INLL podcast — Poterkëscht vum INLL — as episode metadata.
 *
 * The B1 half of the exam is connected speech: a news item, a conversation, a
 * presentation. Everything this repo generates for that half is a single LOD
 * example sentence, read carefully by a dictionary voice, and the README says
 * so plainly. INLL's own learner podcast is the real thing, weekly, and tags
 * each episode with its CEFR level in the title.
 *
 * ── What this writes, and what it deliberately does not ──────────────────
 *
 * Metadata only: a title, a date, a level, a duration, and the publisher's own
 * URLs. **No audio and no transcript text is ever written.** The podcast
 * carries no published licence, so the safe reading is all rights reserved,
 * and this repository is public. The rule already exists in README.md for the
 * identical case of RTL.lu audio:
 *
 *     Link and stream, do not mirror. This is the authentic B1 input.
 *
 * So this file is a bibliography, not a copy. The app streams each episode
 * straight from the publisher, and the Worker fetches the transcript at the
 * moment it is needed rather than anyone storing it.
 *
 * Output goes to `content/external/`, not `content/items/`, and is therefore
 * outside `pipeline/validate.js`. That is deliberate and it is the narrower of
 * two claims: not "this content is exempt", but "there is no content here".
 * The only Luxembourgish in the file is episode titles written by INLL, and
 * running someone else's published titles through a gate built to catch *our*
 * drift would be a category error. `pipeline/test/podcasts.test.js` asserts the
 * file stays that way — no transcript, no `_lb` field, no `audioId` — so this
 * route cannot quietly become a way past the gate.
 *
 * `lib/xml.js` is not reused: it is a strict parser for LOD's machine-generated
 * subset and throws on CDATA, namespaces and mixed content, all of which are
 * normal in a podcast feed. This reads the handful of fields it needs and
 * ignores the rest.
 *
 *   node pipeline/fetch-podcasts.js --feed <url> [--dry]
 *   PODCAST_FEED_URL=<url> node pipeline/fetch-podcasts.js
 */

const crypto = require('node:crypto');
const path = require('node:path');

const paths = require('./lib/paths');
const { writeJson } = require('./lib/write-json');

const UA = 'sproochentest-prep/0.1 (personal exam-prep tool; contact via repository)';
const OUT_CONTENT = path.join(paths.CONTENT_DIR, 'external', 'podcasts.json');
const OUT_APP = path.join(paths.ROOT, 'app', 'data', 'podcasts.json');

const SOURCE = 'Poterkëscht vum INLL';
const ATTRIBUTION = 'Institut national des langues Luxembourg (INLL)';
const LICENCE = 'All rights reserved — streamed from the publisher, never redistributed';
const SHOW_URL = 'https://www.inll.lu/en/poterkescht-the-podcast-in-luxembourgish-from-inll/';

/** Levels worth practising against. The exam is B1 listening + A2 speaking. */
const KEEP_LEVELS = new Set(['A1', 'A2', 'B1', 'A1-A2', 'A2-B1', 'B1-B2']);

/* --------------------------------------------------------------- parsing */

/** CDATA first, then entities. Feeds mix both, often in the same document. */
function decodeText(raw) {
  if (raw === null || raw === undefined) return '';
  let text = String(raw).trim();
  const cdata = text.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) text = cdata[1];
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Ampersand last, or the escapes above would be decoded twice.
    .replace(/&amp;/g, '&')
    .trim();
}

/** First `<tag>…</tag>` body, namespace-tolerant. */
function tagText(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? decodeText(match[1]) : null;
}

/** Attributes of the first self-closing or open `<tag …>`. */
function tagAttrs(block, name) {
  const match = block.match(new RegExp(`<${name}(\\s[^>]*?)/?>`, 'i'));
  if (!match) return null;
  const attrs = {};
  for (const pair of match[1].matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) attrs[pair[1]] = decodeText(pair[2]);
  return attrs;
}

/**
 * The CEFR tag INLL puts in the title — "… (A2)", "… (A2-B1)".
 *
 * Only a trailing parenthesised group is accepted. A level mentioned anywhere
 * else in a title is a topic, not a marker, and guessing from it would sort
 * episodes into the wrong difficulty.
 */
function levelFromTitle(title) {
  const match = String(title).match(/\(\s*([ABC][12](?:\s*-\s*[ABC][12])?)\s*\)\s*$/i);
  if (!match) return null;
  return match[1].toUpperCase().replace(/\s*-\s*/, '-');
}

/** "512", "8:32" and "1:08:32" all appear in the wild. */
function durationSeconds(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  if (/^\d+$/.test(text)) return Number(text);
  const parts = text.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/**
 * One episode, or null when the feed row is unusable.
 *
 * An item with no playable enclosure is dropped rather than shipped as a row
 * that cannot be tapped.
 */
function parseItem(block) {
  const enclosure = tagAttrs(block, 'enclosure');
  const audioSrc = enclosure?.url ?? null;
  if (!audioSrc || !/^https:/i.test(audioSrc)) return null;

  const episodeTitle = tagText(block, 'title');
  if (!episodeTitle) return null;

  const guid = tagText(block, 'guid') ?? audioSrc;
  const published = tagText(block, 'pubDate');
  const publishedAt = published ? new Date(published) : null;

  // Podcasting 2.0 transcripts. Prefer plain text or VTT over HTML/JSON —
  // the Worker feeds this straight to a model and plain text costs least.
  // INLL doesn't use this tag: about half its episodes embed the transcript
  // in <description> instead, after a literal "Transkript:" marker. That
  // text is not extracted or stored here — the Worker re-fetches this same
  // feed by `feedUrl` at question-generation time and reads it from there,
  // per the no-transcript-in-the-repo rule in the file header.
  const transcripts = [...block.matchAll(/<podcast:transcript(\s[^>]*?)\/?>/gi)].map((match) => {
    const attrs = {};
    for (const pair of match[1].matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) attrs[pair[1]] = decodeText(pair[2]);
    return attrs;
  });
  const preferred =
    transcripts.find((entry) => /text\/plain/i.test(entry.type ?? '')) ??
    transcripts.find((entry) => /vtt|srt/i.test(entry.type ?? '')) ??
    transcripts[0] ??
    null;

  return {
    id: `pod-${crypto.createHash('sha1').update(guid).digest('hex').slice(0, 8)}`,
    type: 'podcast-episode',
    level: levelFromTitle(episodeTitle),
    // The cited name of someone else's published work. Not authored here, and
    // not validated here — see the header.
    episodeTitle,
    publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt.toISOString().slice(0, 10) : null,
    durationSec: durationSeconds(tagText(block, 'itunes:duration')),
    audioSrc,
    transcriptUrl: preferred?.url ?? null,
    sourceUrl: tagText(block, 'link') ?? SHOW_URL,
    source: SOURCE,
    attribution: ATTRIBUTION,
    licence: LICENCE,
  };
}

function parseFeed(xml) {
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)]
    .map((match) => parseItem(match[1]))
    .filter(Boolean);
}

/* ------------------------------------------------------------------ main */

function readFlag(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

async function main() {
  const feedUrl = readFlag('--feed') ?? process.env.PODCAST_FEED_URL;
  if (!feedUrl) {
    console.error(
      'Usage: node pipeline/fetch-podcasts.js --feed <rss-url>\n' +
        '   or: PODCAST_FEED_URL=<rss-url> node pipeline/fetch-podcasts.js\n\n' +
        `The feed for ${SOURCE} is linked from ${SHOW_URL}\n` +
        'and from the show page on any podcast directory.',
    );
    process.exit(2);
  }

  const response = await fetch(feedUrl, { headers: { 'user-agent': UA, accept: 'application/rss+xml, application/xml, text/xml' } });
  if (!response.ok) throw new Error(`feed responded ${response.status} ${response.statusText}`);
  const xml = await response.text();

  const all = parseFeed(xml);
  if (all.length === 0) throw new Error('no <item> elements with an https enclosure — is this an RSS feed?');

  // Report before filtering, because the interesting question on a first run is
  // what the feed actually contains, not what survived our rules.
  const levels = new Map();
  for (const episode of all) levels.set(episode.level ?? 'untagged', (levels.get(episode.level ?? 'untagged') ?? 0) + 1);
  const withTranscript = all.filter((episode) => episode.transcriptUrl).length;

  console.log(`feed: ${feedUrl}`);
  console.log(`  ${all.length} episodes with a playable enclosure`);
  console.log(`  levels: ${[...levels].sort().map(([level, count]) => `${level}:${count}`).join(' ')}`);
  console.log(`  transcripts published in the feed: ${withTranscript} of ${all.length}`);
  if (withTranscript === 0) {
    console.log('  → no feed transcripts, so questions will fall back to Whisper in the Worker.');
    console.log('    Luxembourgish ASR is poor; sample the output before trusting it.');
  }

  const kept = all
    .filter((episode) => episode.level === null || KEEP_LEVELS.has(episode.level))
    // Newest first, and anything without a level marker sorts last: an
    // untagged episode is unknown difficulty, not beginner difficulty.
    .sort((a, b) => {
      if ((a.level === null) !== (b.level === null)) return a.level === null ? 1 : -1;
      return String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? ''));
    });

  console.log(`  keeping ${kept.length} at exam-relevant levels`);

  // Carried on every episode, not just in meta: the Worker needs it per
  // request to re-fetch this same feed and pull the one item it was asked
  // about — see the header note on where transcripts actually live.
  for (const episode of kept) episode.feedUrl = feedUrl;

  if (process.argv.includes('--dry')) {
    console.log('\n--dry: nothing written. First three rows:');
    console.log(JSON.stringify(kept.slice(0, 3), null, 2));
    return;
  }

  const payload = {
    meta: {
      fetchedAt: new Date().toISOString(),
      generator: 'pipeline/fetch-podcasts.js',
      source: SOURCE,
      attribution: ATTRIBUTION,
      feedUrl,
      showUrl: SHOW_URL,
      licence: LICENCE,
      note:
        'Episode metadata only. No audio and no transcript text is stored or redistributed: ' +
        'the app streams each episode from the publisher and the Worker fetches a transcript ' +
        'only at the moment it generates questions. Kept outside content/items/ because there ' +
        'is no authored content here to validate — the only Luxembourgish is INLL\'s own ' +
        'episode titles, cited rather than written.',
      counts: { episodes: kept.length, withTranscript: kept.filter((episode) => episode.transcriptUrl).length },
    },
    items: kept,
  };

  await writeJson(OUT_CONTENT, payload);
  await writeJson(OUT_APP, payload);
  console.log(`\nwrote ${path.relative(paths.ROOT, OUT_CONTENT)} and ${path.relative(paths.ROOT, OUT_APP)}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { parseFeed, parseItem, levelFromTitle, durationSeconds, decodeText };
