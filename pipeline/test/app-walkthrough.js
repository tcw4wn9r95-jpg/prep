#!/usr/bin/env node
'use strict';

/**
 * Drives the real app in a real browser at iPhone size.
 *
 * This is not a unit test — it opens the PWA, walks the loop a user actually
 * walks (choose a player, finish a listening set, score a recording, read the
 * readiness number) and screenshots each screen. Anything that only works in
 * theory fails here.
 *
 *   node pipeline/test/app-walkthrough.js [--headed] [--out DIR]
 *
 * Uses the Chromium already installed in the environment; playwright-core is a
 * devDependency and ships no browser of its own.
 */

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const { chromium } = require('playwright-core');
const paths = require('../lib/paths');

const APP_DIR = path.join(paths.ROOT, 'app');
const EXECUTABLE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// iPhone 15/16 logical viewport.
const VIEWPORT = { width: 393, height: 852 };
const DPR = 3;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.m4a': 'audio/mp4',
};

/**
 * Three episodes, always served from memory in place of `app/data/podcasts.json`.
 *
 * That file is built from INLL's live feed by `npm run fetch:podcasts`, so its
 * contents change every week. The walkthrough overrides it unconditionally —
 * asserting on a real 200-row catalogue would make these steps fail whenever
 * INLL published, which is a fact about the feed rather than about the app.
 * Serving a fixture rather than writing one keeps a fake episode list from ever
 * landing on disk, where it could be committed and deployed as if it were real.
 *
 * `hasTranscript` is the interesting axis: INLL publishes one for about half
 * its episodes, and the screen has to offer questions only for those.
 */
const PODCAST_FIXTURE = {
  meta: { source: 'Poterkëscht vum INLL', attribution: 'Institut national des langues Luxembourg (INLL)' },
  items: [
    {
      id: 'pod-test0001',
      type: 'podcast-episode',
      level: 'A2',
      episodeTitle: 'Transportmëttel a Fürerschäin (A2)',
      publishedAt: '2026-05-14',
      durationSec: 512,
      audioSrc: 'https://cdn.example/ep1.mp3',
      transcriptUrl: 'https://cdn.example/ep1.txt',
      hasTranscript: true,
      sourceUrl: 'https://www.inll.lu/',
      source: 'Poterkëscht vum INLL',
      attribution: 'Institut national des langues Luxembourg (INLL)',
      licence: 'All rights reserved — streamed from the publisher, never redistributed',
    },
    {
      id: 'pod-test0002',
      type: 'podcast-episode',
      level: 'B1',
      episodeTitle: 'Iwwer Ernärungstrends schwätzen (B1)',
      publishedAt: '2026-05-21',
      durationSec: 640,
      audioSrc: 'https://cdn.example/ep2.mp3',
      // No tagged url, but INLL embedded one in the description: the index
      // records that as answerable, and the Worker reads it live.
      transcriptUrl: null,
      hasTranscript: true,
      sourceUrl: 'https://www.inll.lu/',
      source: 'Poterkëscht vum INLL',
      attribution: 'Institut national des langues Luxembourg (INLL)',
      licence: 'All rights reserved — streamed from the publisher, never redistributed',
    },
    {
      id: 'pod-test0003',
      type: 'podcast-episode',
      level: 'B1',
      episodeTitle: 'Eng emotional Achterbunnsfaart (B1)',
      publishedAt: '2026-05-28',
      durationSec: 700,
      audioSrc: 'https://cdn.example/ep3.mp3',
      transcriptUrl: null,
      hasTranscript: false,
      sourceUrl: 'https://www.inll.lu/',
      source: 'Poterkëscht vum INLL',
      attribution: 'Institut national des langues Luxembourg (INLL)',
      licence: 'All rights reserved — streamed from the publisher, never redistributed',
    },
  ],
};

function serve(root) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    let filePath = path.join(root, decodeURIComponent(url.pathname));

    if (url.pathname === '/data/podcasts.json') {
      response.writeHead(200, { 'content-type': MIME['.json'] });
      response.end(JSON.stringify(PODCAST_FIXTURE));
      return;
    }
    if (url.pathname === '/' || url.pathname.endsWith('/')) filePath = path.join(filePath, 'index.html');
    if (!filePath.startsWith(root)) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
        return;
      }
      response.writeHead(200, { 'content-type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
      response.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, () => resolve({ server, port: server.address().port })));
}

async function main() {
  const outIndex = process.argv.indexOf('--out');
  const outDir = outIndex === -1 ? path.join(paths.ROOT, 'docs', 'screens') : process.argv[outIndex + 1];
  await fsp.mkdir(outDir, { recursive: true });

  const { server, port } = await serve(APP_DIR);
  const base = `http://localhost:${port}/`;

  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    headless: !process.argv.includes('--headed'),
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });

  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DPR,
    isMobile: true,
    hasTouch: true,
    permissions: ['microphone'],
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });

  const page = await context.newPage();
  const problems = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // Chromium's own "Failed to load resource" line never puts the URL in
    // the text — only in the message's source location — so a bare `.text()`
    // reports every 404 as the same indistinguishable string, and there is no
    // way to tell which resource without this.
    const location = message.location();
    const where = location?.url ? ` @ ${location.url}` : '';
    problems.push(`console: ${message.text()}${where}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => problems.push(`request failed: ${request.url()} (${request.failure()?.errorText})`));

  const shot = async (name) => {
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(outDir, `${name}.png`) });
    process.stdout.write(`  screenshot ${name}\n`);
  };

  const results = [];
  const step = async (name, fn) => {
    try {
      await fn();
      results.push(`PASS  ${name}`);
    } catch (error) {
      results.push(`FAIL  ${name}: ${error.message}`);
      await page.screenshot({ path: path.join(outDir, `FAIL-${name}.png`) }).catch(() => {});
    }
  };

  await page.goto(base, { waitUntil: 'networkidle' });

  await step('onboarding renders with Amelie', async () => {
    await page.waitForSelector('.amelie__svg', { timeout: 5000 });
    const pickers = await page.locator('.player-pick__btn').count();
    if (pickers !== 2) throw new Error(`expected 2 player buttons, found ${pickers} (double render?)`);
    await shot('01-onboarding');
  });

  await step('choose a player and start', async () => {
    await page.locator('.player-pick__btn').filter({ hasText: 'Diego' }).first().click();
    await page.getByRole('button', { name: 'Start practising' }).click();
    await page.waitForSelector('.plan', { timeout: 5000 });
  });

  await step('the cheat sheet is one tap away from anywhere', async () => {
    // It is reference material consulted *while* doing something else, so it
    // lives in the tab bar rather than one level down inside Learn.
    const tabs = await page.locator('.tabbar__item').allTextContents();
    if (!tabs.some((label) => label.trim() === 'Sheet')) {
      throw new Error(`no cheat-sheet tab; tabs are ${tabs.map((t) => t.trim()).join(', ')}`);
    }
    await page.locator('.tabbar__item').filter({ hasText: 'Sheet' }).click();
    await page.waitForSelector('.ref-pronoun', { timeout: 5000 });
    await page.locator('.tabbar__item').filter({ hasText: 'Today' }).click();
    await page.waitForSelector('.plan', { timeout: 5000 });
  });

  await step('today gives exactly one next action and a four-step plan', async () => {
    // The fix for "there is no clear journey": one primary button, and the
    // plan beneath it in the order it should be done.
    const primary = page.locator('#screen > .btn--primary');
    if ((await primary.count()) !== 1) throw new Error(`expected exactly one primary action, found ${await primary.count()}`);
    process.stdout.write(`  next action: ${(await primary.textContent())?.trim()}\n`);
    const order = (await page.locator('.plan .card__title').allTextContents()).map((text) => text.trim());
    const expected = 'Words & grammar,Grammar & sentence structure,Listening,Speaking';
    if (order.join(',') !== expected) throw new Error(`plan out of order: ${order.join(', ')}`);

    // Every step says which part of the exam it is for. The plan used to read
    // as a study list, which is the frame the app is meant to argue against.
    const purposes = (await page.locator('.plan__for').allTextContents()).map((text) => text.trim());
    if (purposes.length !== order.length) throw new Error(`${order.length} steps but ${purposes.length} say what they are for`);
    if (!purposes.some((text) => /Schwätzen/.test(text)) || !purposes.some((text) => /Verstoen/.test(text))) {
      throw new Error(`the plan never names the two halves of the exam: ${purposes.join(' | ')}`);
    }
    await shot('00-today');
  });

  await step('sentence structure teaches the rule before asking for it', async () => {
    // The user's report: word order is the thing an English speaker gets
    // wrong, and the app drilled it without ever stating the rule. Theory
    // first, three graded steps, then the practice.
    await page.goto(`${base}#/structure`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.ref-topic__rule', { timeout: 5000 });
    const rules = await page.locator('.ref-topic__rule').count();
    if (rules !== 3) throw new Error(`expected the three structure rules, found ${rules}`);
    const sentences = await page.locator('.ref-topic__sentence').count();
    if (sentences < 3) throw new Error(`the theory shows no worked examples (${sentences})`);
    await shot('00b-structure');

    await page.locator('#screen > .btn--primary').click();
    await page.waitForSelector('#screen .screen__title', { timeout: 5000 });
    const title = (await page.locator('#screen .screen__title').first().textContent())?.trim();
    if (title !== 'Sentence structure') throw new Error(`practising structure landed on "${title}"`);
    // Three orderings of one sentence — the card shape the whole feature is.
    await page.waitForSelector('.option', { timeout: 5000 });
    const options = await page.locator('.option').count();
    if (options < 2) throw new Error(`a structure card offered ${options} orderings`);
    await shot('00c-structure-drill');
    await page.goto(`${base}#/today`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.plan', { timeout: 5000 });
  });

  await step('the notecards are a course you can walk through', async () => {
    // The grammar as levels rather than as a reference to dip into: a contents
    // page, then a card per level that states the rule, teaches it, and shows
    // real sentences, with the next level and the matching drill both one tap
    // away. The whole point is that it can be read start to finish, so the
    // check is that the walk actually works, not just that the page renders.
    await page.goto(`${base}#/notecards`, { waitUntil: 'networkidle' });
    await page.waitForSelector('a.card[href^="#/notecards/"]', { timeout: 5000 });
    const levels = await page.locator('a.card[href^="#/notecards/"]').count();
    if (levels < 19) throw new Error(`the course lists ${levels} levels, fewer than the published syllabus`);
    await shot('00d-notecards');

    // Level 1, and from there the walk onwards.
    await page.locator('a.card[href^="#/notecards/"]').first().click();
    await page.waitForSelector('.ref-topic__rule', { timeout: 5000 });
    const points = await page.locator('.ref-topic__point').count();
    if (points < 2) throw new Error(`a notecard carried ${points} paragraphs of teaching`);
    const shown = await page.locator('.ref-topic__sentence, .ref-frame').count();
    if (shown === 0) throw new Error('a notecard stated a rule with nothing to illustrate it');
    const sub = (await page.locator('#screen .screen__sub').first().textContent())?.trim();
    if (!/Level 1 of/.test(sub ?? '')) throw new Error(`the first card says "${sub}" rather than naming its level`);
    await shot('00e-notecard');

    // Next → level 2, and the drill button lands on that level's own cards.
    await page.locator('a.card[href="#/notecards/nrule"]').first().click();
    await page.waitForSelector('.ref-topic__rule', { timeout: 5000 });
    await page.locator('#screen > .btn--primary').click();
    await page.waitForSelector('#screen .screen__title', { timeout: 5000 });
    const title = (await page.locator('#screen .screen__title').first().textContent())?.trim();
    if (title !== 'The n-rule (Eifeler Regel)') throw new Error(`practising the n-rule notecard landed on "${title}"`);
    await shot('00f-notecard-drill');

    await page.goto(`${base}#/today`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.plan', { timeout: 5000 });
  });

  await step('the next action leads somewhere real', async () => {
    await page.locator('#screen > .btn--primary').click();
    await page.waitForSelector('#screen .screen__title', { timeout: 5000 });
    const title = await page.locator('#screen .screen__title').first().textContent();
    if (!title?.trim()) throw new Error('the primary action landed on a blank screen');
    await page.goto(`${base}#/journey`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.journey__list', { timeout: 5000 });
  });

  await step('journey shows all topics', async () => {
    const nodes = await page.locator('.node').count();
    if (nodes < 18) throw new Error(`expected 18 topic nodes, found ${nodes}`);
    await shot('02-journey');
  });

  let questionCount = 0;
  await step('listening set runs to completion', async () => {
    await page.locator('.node').first().click();
    await page.waitForSelector('.options .option', { timeout: 5000 });
    await shot('03-listening');

    // Answer every question; deliberately pick option A each time so the run
    // produces a realistic mixed score rather than a perfect one.
    for (let guard = 0; guard < 40; guard += 1) {
      const options = page.locator('.options .option');
      if ((await options.count()) === 0) break;
      await options.first().click();
      questionCount += 1;
      if (guard === 0) await shot('04-listening-answered');

      const next = page.getByRole('button', { name: /^(Next|Finish)$/ });
      await next.waitFor({ state: 'visible', timeout: 3000 });
      const label = (await next.textContent())?.trim();
      await next.click();
      if (label === 'Finish') break;
      await page.waitForSelector('.options .option', { timeout: 5000 });
    }
    await page.waitForSelector('text=This set', { timeout: 5000 });
    await shot('05-listening-done');
  });

  await step(`answered all 20 questions (got ${questionCount})`, async () => {
    if (questionCount !== 20) throw new Error(`expected 20 questions, answered ${questionCount}`);
  });

  await step('speaking offers basics and two exam topics', async () => {
    await page.goto(`${base}#/speaking`, { waitUntil: 'networkidle' });
    await page.waitForSelector('a.card', { timeout: 5000 });
    const basics = await page.locator('a.card[href="#/speaking/basics"]').count();
    if (basics !== 1) throw new Error(`expected 1 basics card, found ${basics}`);
    const topics = await page.locator('a.card[href^="#/speaking/"]:not([href*="/image"]):not([href="#/speaking/basics"])').count();
    if (topics !== 2) throw new Error(`expected 2 exam topics, found ${topics}`);
    await shot('06-speaking-choose');
  });

  await step('interview shows prep timer then records', async () => {
    await page.locator('a.card[href^="#/speaking/"]:not([href*="/image"]):not([href="#/speaking/basics"])').first().click();
    await page.waitForSelector('.timer', { timeout: 5000 });
    await shot('07-interview-prep');
    await page.getByRole('button', { name: 'Start now' }).click();
    await page.waitForSelector('.btn--record', { timeout: 8000 });
    await shot('08-interview-recording');
    await page.waitForTimeout(1500);
    await page.locator('.btn--record').click();
    await page.waitForSelector('audio', { timeout: 8000 });
    await shot('09-interview-done');
  });

  // Score that recording as the partner, which is the only way readiness moves.
  await step('partner can score the recording on the official grid', async () => {
    await page.evaluate(async () => {
      const store = await import('./js/store.js');
      await store.saveSettings({ playerId: 'diana' });
    });
    await page.goto(`${base}#/review`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.bands .band', { timeout: 5000 });
    await shot('10-review-grid');

    const criteria = page.locator('.rubric .card');
    const count = await criteria.count();
    if (count !== 4) throw new Error(`expected 4 official criteria, found ${count}`);
    for (let i = 0; i < count; i += 1) {
      await criteria.nth(i).locator('.band').nth(4).click(); // band 4 of 5
    }
    // The interlocutor's global mark lives in its own card below the grid.
    await page.locator('.card').filter({ hasText: 'Global impression' }).locator('.band').nth(3).click();
    await shot('11-review-scored');

    const submit = page.getByRole('button', { name: /Submit score/ });
    if (await submit.isDisabled()) throw new Error('submit still disabled after scoring every criterion');
    await submit.click();
    await page.locator('.meter__label', { hasText: 'score' }).first().waitFor({ timeout: 5000 });
    await shot('12-review-done');
  });

  await step('readiness reflects the peer score', async () => {
    await page.evaluate(async () => {
      const store = await import('./js/store.js');
      await store.saveSettings({ playerId: 'diego' });
    });
    await page.goto(`${base}#/readiness`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.meter__value', { timeout: 5000 });
    const speaking = await page.locator('.meter__value').first().textContent();
    if (!speaking || speaking.trim() === '—') throw new Error('speaking readiness still empty after a peer score');
    process.stdout.write(`  speaking readiness: ${speaking.trim()}\n`);
    await shot('13-readiness');
  });

  // The Learn drill escalates a word from "pick the meaning" to "type it" as
  // its box rises, so the only way to see the hard card types is to seed the
  // box state first. Each pass below plants one word at one box and asserts the
  // card that comes back is the one the ladder promises.
  // goto() with a hash that already matches is a same-document navigation, so
  // the app never re-renders and the previous card stays on screen. Every
  // drill step below starts a genuinely fresh session, so force a reload.
  const openFresh = async (hash) => {
    await page.goto(`${base}${hash}`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    // A reload replays the boot splash, which holds for 1.5s and would
    // otherwise be what every screenshot below captures.
    await page.waitForSelector('.splash.is-hidden', { timeout: 5000 }).catch(() => {});
  };

  /**
   * Plant one word at one box.
   *
   * The box is reached by calling the real scheduler, so the row shape, key and
   * promotion rules are the app's own rather than a fixture's guess. Only the
   * clock is then moved: a correct answer schedules the next review days out,
   * and the test cannot wait three days to see the card it is asserting on.
   */
  const seedLearn = async (playerId, deck, strand, itemId, box, { due = true } = {}) => {
    await page.evaluate(
      async ({ playerId, deck, strand, itemId, box, due }) => {
        const store = await import('./js/store.js');
        for (let i = 0; i < box; i += 1) {
          await store.recordLearnResult(playerId, deck, strand, itemId, { correct: true });
        }
        if (!due) return;
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open('sproochentest');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const key = `${playerId}:${deck}:${strand}:${itemId}`;
        await new Promise((resolve, reject) => {
          const store2 = db.transaction('learn', 'readwrite').objectStore('learn');
          const read = store2.get(key);
          read.onsuccess = () => {
            const row = read.result;
            row.dueAt = Date.now() - 1000;
            const write = store2.put(row);
            write.onsuccess = () => resolve();
            write.onerror = () => reject(write.error);
          };
          read.onerror = () => reject(read.error);
        });
        db.close();
      },
      { playerId, deck, strand, itemId, box, due },
    );
  };

  /** Wipe learn progress so a seeded card is not competing with a backlog. */
  const clearLearn = async () => {
    await page.evaluate(async () => {
      const db = await new Promise((resolve) => {
        const request = indexedDB.open('sproochentest');
        request.onsuccess = () => resolve(request.result);
      });
      await new Promise((resolve) => {
        const clear = db.transaction('learn', 'readwrite').objectStore('learn').clear();
        clear.onsuccess = () => resolve();
      });
      db.close();
    });
  };

  await step('pairs starts at level 1 with the board face down', async () => {
    await openFresh('#/pairs');
    await page.waitForSelector('.pairs__tile', { timeout: 5000 });
    const tiles = await page.locator('.pairs__tile').count();
    if (tiles !== 10) throw new Error(`level 1 should be 5 pairs / 10 tiles, found ${tiles}`);

    const title = (await page.locator('#screen .screen__title').first().textContent())?.trim();
    if (!/level 1$/.test(title ?? '')) throw new Error(`expected level 1, got "${title}"`);

    // Face down means not readable, but still in the DOM for screen readers.
    const visible = await page.locator('.pairs__face').first().isVisible();
    if (visible) throw new Error('tiles are readable before being turned over');
    await shot('16f-pairs');
  });

  await step('a solved board saves the level and offers the next one', async () => {
    // Solve it properly rather than by brute force: ask the real module which
    // words level 1 holds, then read the face text of each tile (present in the
    // DOM even face-down, so screen readers can reach it) and click the two
    // that belong together. Brute force on a 10-tile board would spend most of
    // a minute sitting through the deliberate flip-back pause.
    const pairsModule = await import(pathToFileURL(path.join(APP_DIR, 'js', 'screens', 'pairs.js')).href);
    const vocabItems = JSON.parse(await fsp.readFile(path.join(APP_DIR, 'data', 'vocab.json'), 'utf8')).items;
    const verbItems = JSON.parse(await fsp.readFile(path.join(APP_DIR, 'data', 'verbs.json'), 'utf8')).items;
    const level1 = pairsModule.wordsForLevel(pairsModule.orderedPairPool(vocabItems, verbItems), 1);

    const faces = await page.locator('.pairs__face').evaluateAll((nodes) => nodes.map((node) => node.textContent));
    for (const word of level1) {
      const a = faces.indexOf(word.lb);
      const b = faces.indexOf(word.en);
      if (a === -1 || b === -1) throw new Error(`level 1 board is missing ${word.lb} / ${word.en}`);
      await page.locator('.pairs__tile').nth(a).click();
      await page.locator('.pairs__tile').nth(b).click();
      await page.waitForTimeout(120);
    }

    // The board is deliberately held for a moment before the win card, so the
    // final pair can actually be read — the last word matched used to vanish
    // in the same frame it was revealed.
    await page.waitForSelector('.pairs__tile.is-found', { timeout: 3000 });
    const stillOnBoard = await page.locator('.pairs__tile.is-found').count();
    if (stillOnBoard !== 10) throw new Error(`the finished board should stay up briefly, found ${stillOnBoard} tiles`);

    await page.waitForSelector('text=Level 1 cleared', { timeout: 8000 });
    await shot('16g-pairs-cleared');
    if (!(await page.getByRole('button', { name: 'Level 2' }).isVisible())) {
      throw new Error('clearing a level did not offer the next one');
    }

    // Every word from the level is written out, so nothing is lost when the
    // board goes away.
    const recap = await page.locator('.ref-frame').count();
    if (recap !== 5) throw new Error(`expected all 5 pairs listed after the win, found ${recap}`);
    for (const word of level1) {
      if (!(await page.locator('.ref-frame', { hasText: word.lb }).first().isVisible())) {
        throw new Error(`${word.lb} is missing from the recap`);
      }
    }

    // Reopening must land on level 2, not send the player back to level 1.
    await openFresh('#/pairs');
    await page.waitForSelector('.pairs__tile', { timeout: 5000 });
    const title = (await page.locator('#screen .screen__title').first().textContent())?.trim();
    if (!/level 2$/.test(title ?? '')) throw new Error(`progress was not saved — reopened at "${title}"`);
  });

  await step('the largest pairs board still fits on one screen', async () => {
    // The whole game is remembering where a tile was, so the board has to be
    // visible in one look. MAX_PAIRS in pairs.js is chosen from this
    // measurement — assert it here so the number cannot drift out of sync with
    // the layout it was picked for.
    await openFresh('#/pairs/40');
    await page.waitForSelector('.pairs__tile', { timeout: 5000 });
    const tiles = await page.locator('.pairs__tile').count();
    if (tiles !== 28) throw new Error(`the top level should be 14 pairs / 28 tiles, found ${tiles}`);

    const fit = await page.evaluate(() => {
      const board = document.querySelector('.pairs').getBoundingClientRect();
      // Pairs is a focus route, so the tab bar is hidden while a board is
      // running and the floor is the viewport itself. A *hidden* element still
      // answers getBoundingClientRect() — with an all-zero rect — so this has
      // to test for the bar being laid out, not merely present in the DOM.
      const bar = document.querySelector('#tabbar');
      const barTop = bar && !bar.hidden ? bar.getBoundingClientRect().top : window.innerHeight;
      return { bottom: Math.round(board.bottom), floor: Math.round(barTop) };
    });
    if (fit.bottom > fit.floor) {
      throw new Error(`the 28-tile board runs ${fit.bottom - fit.floor}px off the bottom of the screen`);
    }
    process.stdout.write(`  largest board clears the bottom by ${fit.floor - fit.bottom}px\n`);
  });

  await step('What is this? shows a picture and asks for the word, multiple choice only', async () => {
    // pipeline/fetch-object-images.js pulls from Wikimedia Commons at fetch
    // time — this repo does not commit the photos it finds, the same reason
    // images.json/podcasts.json are not committed either. So this step covers
    // both states a real checkout can be in: the graceful "not fetched yet"
    // message if nobody has run the script, or the full round if they have.
    // Whichever branch runs, it is testing a real code path.
    let objectsFile = { items: [] };
    try {
      objectsFile = JSON.parse(await fsp.readFile(path.join(APP_DIR, 'data', 'word-images.json'), 'utf8'));
    } catch {
      // absent entirely — same as "not enough photos yet" below
    }

    if (objectsFile.items.length < 8) {
      await openFresh('#/objects');
      await page.waitForSelector('.empty', { timeout: 5000 });
      const text = await page.locator('.empty').textContent();
      if (!/fetch:object-images/.test(text ?? '')) throw new Error(`expected the empty state to point at the fetch script, got: ${text}`);
      await shot('16h-objects-empty');
      return;
    }

    await openFresh('#/objects');
    await page.waitForSelector('.options .option', { timeout: 5000 });

    const phaseLabel = () => page.locator('#screen .meter__label').first().textContent();
    if (!/multiple choice/i.test((await phaseLabel()) ?? '')) throw new Error(`expected a multiple-choice card, got "${await phaseLabel()}"`);

    const img = page.locator('#screen img').first();
    if (!(await img.isVisible())) throw new Error('no picture is shown for the first card');
    const credit = (await page.locator('#screen .source-note').first().textContent())?.trim();
    if (!credit || credit === '·') throw new Error(`expected a credit/licence line under the picture, got "${credit}"`);
    await shot('16h-objects-choice');

    // Answer all eight cards (right or wrong does not matter for this check —
    // only that the round is multiple choice throughout and reaches the end).
    for (let i = 0; i < 8; i += 1) {
      await page.waitForSelector('.options .option', { timeout: 5000 });
      await page.locator('.options .option').first().click();
      await page.waitForTimeout(1700); // the engine's own wrong-answer pause is 1600ms
    }

    await page.waitForSelector('text=Another round', { timeout: 5000 });
    const bankTiles = await page.locator('.bank__tile').count();
    if (bankTiles > 0) throw new Error('expected no letter-bank spelling phase, found bank tiles');
    await shot('16i-objects-done');
  });

  await step('Change the word asks the dative transformation, then shows a real sentence', async () => {
    await openFresh('#/forms');
    await page.waitForSelector('.options .option', { timeout: 5000 });

    // The prompt is the transformation itself — "bei + ech → ?" — not a gapped
    // sentence, which is what makes this a different exercise from the
    // grammar deck's own dative cards.
    const prompt = (await page.locator('#screen .screen__title').last().textContent()) ?? '';
    if (!/\+.*→/.test(prompt)) throw new Error(`expected a "prep + pronoun → ?" prompt, got "${prompt}"`);
    // The English gloss is what tells si (she) from si (they) and mir (we)
    // from mir (to me) — without it a card is unanswerable.
    const gloss = await page.locator('#screen .card__note').first().textContent();
    if (!/means/.test(gloss ?? '')) throw new Error(`expected a gloss disambiguating the pronoun, got "${gloss}"`);
    await shot('16j-forms-prompt');

    const options = await page.locator('.options .option').count();
    if (options !== 4) throw new Error(`expected four dative options, found ${options}`);

    // Answering reveals LOD's own sentence using that preposition and pronoun.
    await page.locator('.options .option').first().click();
    await page.waitForFunction(
      () => [...document.querySelectorAll('#screen .source-note')].some((node) => /real sentence from LOD/i.test(node.textContent ?? '')),
      { timeout: 5000 },
    );
    await shot('16k-forms-answered');

    // Play the round out; it ends on the whole eight-row table.
    for (let i = 0; i < 10; i += 1) {
      const remaining = await page.locator('.options .option').count();
      if (remaining === 0) break;
      await page.locator('.options .option').first().click();
      await page.waitForTimeout(2700); // the wrong-answer pause is 2600ms
    }
    await page.waitForSelector('text=The whole table', { timeout: 5000 });
    await shot('16l-forms-done');
  });

  await step('the Arcade lists all fifteen sentence functions and plays a round', async () => {
    await openFresh('#/arcade');
    await page.waitForSelector('.plan', { timeout: 5000 });

    // The index carries the verb games too, so count only the sentence
    // functions — they are the rows whose id is not namespaced `verb-`.
    const hrefs = await page.locator('#screen .plan').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')));
    const games = hrefs.filter((href) => !href.includes('/arcade/verb-')).length;
    if (games !== 15) throw new Error(`expected fifteen sentence functions, found ${games} of ${hrefs.length} rows`);
    // Each row has to say what the sentence is *for* — "Having" alone does not
    // tell a beginner they are about to learn "I have / do you have".
    const asks = await page.locator('#screen .plan__for').allTextContents();
    if (asks.length !== hrefs.length || asks.some((ask) => !ask.trim())) throw new Error('a row does not say what it is for');
    await shot('16m-arcade-index');

    await page.locator('#screen .plan').first().click();
    await page.waitForSelector('.options .option, .bank__tile', { timeout: 5000 });
    await shot('16n-arcade-round');

    // Answering right or wrong does not matter here — only that every question
    // shape the round can serve (a choice, or a sentence built from word
    // tiles) is drivable and the round reaches its end card.
    for (let guard = 0; guard < 20; guard += 1) {
      if ((await page.locator('.options .option').count()) > 0) {
        await page.locator('.options .option').first().click();
      } else if ((await page.locator('.bank__tile').count()) > 0) {
        await page.locator('.bank__tile').first().click();
        await page.getByRole('button', { name: 'Check' }).click();
      } else {
        break;
      }
      await page.waitForTimeout(1900); // the wrong-answer pause is 1800ms
    }
    await page.waitForSelector('text=This round', { timeout: 5000 });
    await shot('16o-arcade-done');

    // The word patterns — question words, connectors, here/there — are a
    // closed set of words rather than a frame, so their card is the word
    // gapped out of its own LOD example, with the gloss as the question.
    await openFresh('#/arcade/questions');
    await page.waitForSelector('.drill__instruction', { timeout: 5000 });

    // Play the whole round, collecting what each card asked. A round is a
    // shuffled mix of card shapes, so the word card is not necessarily first —
    // and a build card in the middle must not stop the walk.
    const asked = [];
    let gapped = '';
    for (let guard = 0; guard < 12; guard += 1) {
      const instruction = (await page.locator('.drill__instruction').textContent().catch(() => null)) ?? '';
      if (!instruction) break;
      asked.push(instruction);
      if (/Which word means/.test(instruction) && !gapped) {
        gapped = (await page.locator('#screen .card p').first().textContent()) ?? '';
        await shot('16p-arcade-word');
      }
      if ((await page.locator('.options .option').count()) > 0) {
        await page.locator('.options .option').first().click();
      } else if ((await page.locator('.bank__tile').count()) > 0) {
        await page.locator('.bank__tile').first().click();
        await page.getByRole('button', { name: 'Check' }).click();
      } else {
        break;
      }
      await page.waitForTimeout(1900);
    }

    if (!asked.some((instruction) => /Which word means/.test(instruction))) {
      throw new Error(`the question-words round never asked about a question word; it asked: ${[...new Set(asked)].join(' / ')}`);
    }
    // The answer must not be sitting in the sentence it was cut out of.
    if (!gapped.includes('___')) throw new Error(`expected a gapped sentence, got "${gapped}"`);
  });

  await step('an Arcade round costs nothing: the daily goal does not move', async () => {
    // This is the whole reason the tab exists — somewhere to keep playing once
    // the day's new-word budget is spent. If a round quietly counted towards
    // the goal it would be just another session with a different skin, so the
    // promise is asserted end-to-end rather than only in arcade.test.js.
    const readCards = async () => {
      await openFresh('#/today');
      await page.waitForSelector('.plan', { timeout: 5000 });
      const note = (await page.locator('.plan').first().innerText()).trim();
      const match = note.match(/(\d+)\s+of\s+\d+\s+cards|Done — (\d+) cards?/);
      if (!match) throw new Error(`the Words step does not report a card count: "${note.replace(/\n/g, ' | ')}"`);
      return Number(match[1] ?? match[2]);
    };

    const before = await readCards();
    await openFresh('#/arcade/having');
    await page.waitForSelector('.options .option, .bank__tile', { timeout: 5000 });
    let answered = 0;
    for (let guard = 0; guard < 20; guard += 1) {
      if ((await page.locator('.options .option').count()) > 0) {
        await page.locator('.options .option').first().click();
      } else if ((await page.locator('.bank__tile').count()) > 0) {
        await page.locator('.bank__tile').first().click();
        await page.getByRole('button', { name: 'Check' }).click();
      } else {
        break;
      }
      answered += 1;
      await page.waitForTimeout(1900);
    }
    if (answered === 0) throw new Error('the Arcade round offered nothing to answer');
    await page.waitForSelector('text=This round', { timeout: 5000 });

    const after = await readCards();
    if (after !== before) throw new Error(`${answered} Arcade questions moved the daily count ${before} → ${after}`);
    process.stdout.write(`  ${answered} Arcade questions, daily count unchanged at ${before}\n`);
  });

  await step('the Arcade has a Verbs section with five games', async () => {
    await openFresh('#/arcade');
    await page.waitForSelector('.plan', { timeout: 5000 });

    const headings = (await page.locator('#screen .meter__label').allTextContents()).map((text) => text.trim());
    for (const heading of ['Sentence functions', 'Verbs']) {
      if (!headings.includes(heading)) throw new Error(`no "${heading}" section; found ${headings.join(', ')}`);
    }
    // Fifteen sentence functions plus five verb games, all on one index.
    const rows = await page.locator('#screen .plan').count();
    if (rows !== 20) throw new Error(`expected 15 patterns + 5 verb games = 20 rows, found ${rows}`);
    await shot('16r-arcade-index-verbs');
  });

  await step('each verb game has its own mechanic, not five of the same card', async () => {
    // The ask was for games that are actually different from one another, so
    // the check is that each one renders the interaction it was designed for
    // rather than defaulting to a row of multiple-choice buttons.
    const expected = [
      { id: 'verb-meaning', instruction: /What does this verb mean|Which verb is this/, control: '.options .option' },
      { id: 'verb-person', instruction: /Who is doing it/, control: '.options .option' },
      { id: 'verb-form', instruction: /Build the form/, control: '.bank__tile' },
      { id: 'verb-past', instruction: /Which one makes its past/, control: '.options .option' },
      { id: 'verb-number', instruction: /One person, or more than one/, control: '.options .option' },
    ];

    for (const game of expected) {
      await openFresh(`#/arcade/${game.id}`);
      await page.waitForSelector(game.control, { timeout: 5000 });
      const instruction = (await page.locator('.drill__instruction').textContent()) ?? '';
      if (!game.instruction.test(instruction)) throw new Error(`${game.id} asked "${instruction}"`);
      const controls = await page.locator(game.control).count();
      if (controls === 0) throw new Error(`${game.id} rendered no ${game.control}`);

      // The two sorts are binary by design — two big targets, answered by
      // reflex. Anything else there means the sort turned into a quiz.
      if (game.id === 'verb-past' || game.id === 'verb-number') {
        if (controls !== 2) throw new Error(`${game.id} is a two-way sort but offered ${controls} choices`);
      }
    }
    await shot('16s-arcade-verb-sort');
  });

  await step('a verb round plays to the end and shows the best run', async () => {
    await openFresh('#/arcade/verb-number');
    let answers = 0;
    for (let guard = 0; guard < 16; guard += 1) {
      const options = page.locator('.options .option');
      if ((await options.count()) === 0) break;
      // Always tap the first button. The round is balanced half singular and
      // half plural, so this cannot score better than about half — which is
      // the property the balancing exists to guarantee.
      await options.first().click();
      answers += 1;
      await page.waitForTimeout(1900);
    }
    if (answers < 10) throw new Error(`the sort round ended after ${answers} cards`);
    await page.waitForSelector('text=This round', { timeout: 5000 });

    const score = (await page.locator('#screen .meter__value').textContent())?.trim() ?? '';
    const [got, total] = score.split('/').map((part) => Number(part.trim()));
    if (total !== 10) throw new Error(`expected a ten-card sort, got ${score}`);
    if (got === total) throw new Error('tapping one side scored full marks — the round is not balanced');
    process.stdout.write(`  one-sided tapping scored ${score} on the balanced sort\n`);
    await shot('16t-arcade-verb-done');
  });

  await step('the Arcade only builds sentences out of A1 words', async () => {
    // The complaint this answers: "I'm supposed to build a sentence but there
    // are many words I still don't know." Every sentence a build card asks for
    // now has to carry the a1 stamp that pipeline/build-a1.js writes, so the
    // check here is that what reaches the screen is one of those.
    const phrases = JSON.parse(await fsp.readFile(path.join(APP_DIR, 'data', 'phrases.json'), 'utf8'));
    const readable = new Set(
      phrases.items.flatMap((item) => (item.examples ?? []).filter((example) => example.a1).map((example) => example.lb)),
    );
    if (readable.size === 0) throw new Error('no phrase example carries the a1 stamp — run npm run build:a1');

    await openFresh('#/arcade');
    await page.waitForSelector('.plan', { timeout: 5000 });
    const intro = await page.locator('#screen .card__note').allTextContents();
    if (!intro.some((text) => /A1 words only/i.test(text))) {
      throw new Error(`the index does not say the A1 filter is on: ${intro.join(' | ')}`);
    }

    // Play the pattern with the most build cards and check every sentence the
    // word bank is built from is a stamped one.
    await openFresh('#/arcade/location');
    let built = 0;
    for (let guard = 0; guard < 12; guard += 1) {
      const instruction = (await page.locator('.drill__instruction').textContent().catch(() => null)) ?? '';
      if (!instruction) break;
      if ((await page.locator('.bank__tile').count()) > 0) {
        const tiles = (await page.locator('.bank__tile').allTextContents()).map((tile) => tile.trim());
        // The bank is the answer's words plus decoys, and both come from
        // stamped sentences — so every tile must appear in one of them.
        const vocabulary = new Set([...readable].flatMap((sentence) => sentence.split(/\s+/)));
        const stray = tiles.filter((tile) => !vocabulary.has(tile));
        if (stray.length > 0) throw new Error(`build card offers words from no A1 sentence: ${stray.join(', ')}`);
        built += 1;
        await page.locator('.bank__tile').first().click();
        await page.getByRole('button', { name: 'Check' }).click();
      } else if ((await page.locator('.options .option').count()) > 0) {
        await page.locator('.options .option').first().click();
      } else {
        break;
      }
      await page.waitForTimeout(1900);
    }
    if (built === 0) throw new Error('the location round served no build card to check');
    process.stdout.write(`  ${built} build cards, all words from A1 sentences (${readable.size} stamped)\n`);
    await shot('16q-arcade-a1');
  });

  await step('the A1 filter can be switched off, and it sticks', async () => {
    await openFresh('#/settings');
    const toggle = page.locator('#arcade-a1');
    await toggle.waitFor({ timeout: 5000 });
    if (!(await toggle.isChecked())) throw new Error('the A1 filter should default to on');
    await toggle.uncheck();
    await page.getByRole('button', { name: /^Save/ }).first().click();
    await page.waitForTimeout(300);

    await openFresh('#/settings');
    if (await page.locator('#arcade-a1').isChecked()) throw new Error('the A1 filter switched back on after a reload');

    // With it off the index stops claiming the filter is applied.
    await openFresh('#/arcade');
    await page.waitForSelector('.plan', { timeout: 5000 });
    const intro = await page.locator('#screen .card__note').allTextContents();
    if (intro.some((text) => /A1 words only/i.test(text))) throw new Error('the index still advertises a filter that is off');

    // Put it back, so later steps see the shipped default.
    await openFresh('#/settings');
    await page.locator('#arcade-a1').check();
    await page.getByRole('button', { name: /^Save/ }).first().click();
    await page.waitForTimeout(300);
  });

  await step('seven tabs still fit, down to the narrowest Android width', async () => {
    // Adding Arcade made it seven, and `grid-auto-columns: 1fr` refuses to
    // shrink a column below its label — so the bar overflowed at 360px while
    // looking fine on the iPhone viewport everything else is measured at.
    const sizes = [VIEWPORT, { width: 360, height: 780 }, { width: 320, height: 568 }];
    for (const size of sizes) {
      await page.setViewportSize(size);
      await openFresh('#/today');
      await page.waitForSelector('.tabbar__item', { timeout: 5000 });
      const tabs = await page.locator('.tabbar__item').count();
      if (tabs !== 7) throw new Error(`expected seven tabs, found ${tabs}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) throw new Error(`the tab bar overflows by ${overflow}px at ${size.width}px`);
    }
    await page.setViewportSize(VIEWPORT);
    process.stdout.write(`  no overflow at ${sizes.map((size) => `${size.width}px`).join(', ')}\n`);
  });

  await step('the cheat sheet shows pronouns, verb tables and sentence patterns', async () => {
    await openFresh('#/reference');
    await page.waitForSelector('.ref-pronoun', { timeout: 5000 });
    const pronouns = await page.locator('.ref-pronoun').count();
    if (pronouns !== 7) throw new Error(`expected 7 subject pronouns, found ${pronouns}`);

    const verbCount = await page.locator('.ref-verb').count();
    if (verbCount < 6) throw new Error(`expected at least 6 verb tables, found ${verbCount}`);

    // Verb forms are behind <details> until tapped, so a beginner is not
    // shown a dozen-plus conjugated forms at once.
    const firstVerb = page.locator('.ref-verb').first();
    if (await firstVerb.locator('.ref-verb__form').isVisible().catch(() => false)) {
      throw new Error('the first verb table is not collapsed by default');
    }
    await firstVerb.locator('summary').click();
    // Present (6) + past tense (6) + imperative (up to 2): every core verb
    // that has all three, not just the present-tense conjugation this table
    // used to stop at.
    const forms = await firstVerb.locator('.ref-verb__form').count();
    if (forms < 6) throw new Error(`expected at least 6 present-tense forms once expanded, found ${forms}`);
    const groupLabels = await firstVerb.locator('.meter__label').allTextContents();
    if (!groupLabels.some((text) => text.trim() === 'Present')) throw new Error(`expected a "Present" group label, got: ${groupLabels.join(', ')}`);
    if (!groupLabels.some((text) => text.trim() === 'Past')) throw new Error(`expected a "Past" group label, got: ${groupLabels.join(', ')}`);

    const groups = await page.locator('.ref-group').count();
    if (groups < 5) throw new Error(`expected several sentence-pattern groups, found ${groups}`);
    await shot('16d-cheat-sheet');
  });

  await step('the "100 verbs" tab lists the most-used verbs, ranked, each with past and imperative', async () => {
    // The other half of the ask: a lookup table for the moment the nine core
    // verbs above are not the one needed, ranked by real corpus frequency
    // rather than alphabetically or by whatever order the source XML happens
    // to list them in.
    const tabs = page.locator('[role="tab"]');
    if ((await tabs.count()) !== 2) throw new Error(`expected 2 cheat-sheet tabs, found ${await tabs.count()}`);
    await tabs.filter({ hasText: '100 verbs' }).click();
    await page.waitForSelector('.ref-verb', { timeout: 5000 });

    const verbCount = await page.locator('.ref-verb').count();
    if (verbCount !== 100) throw new Error(`expected 100 verbs, found ${verbCount}`);

    // hunn is the most frequent verb in the shipped deck (rank 1) — the list
    // has to lead with it, not with whatever the source order happens to be.
    const firstTitle = (await page.locator('.ref-verb').first().locator('summary .card__title').textContent())?.trim();
    if (firstTitle !== 'hunn') throw new Error(`expected the most frequent verb first, got "${firstTitle}"`);

    const first = page.locator('.ref-verb').first();
    await first.locator('summary').click();
    const groupLabels = await first.locator('.meter__label').allTextContents();
    if (!groupLabels.some((text) => text.trim() === 'Imperative')) {
      throw new Error(`expected hunn to show an Imperative group, got: ${groupLabels.join(', ')}`);
    }
    await shot('16e-cheat-sheet-verb-list');

    // Switching back lands on the same nine-verb "Basics" tab, not on an
    // empty screen — the tab state is local to this open, nothing more.
    await tabs.filter({ hasText: 'Basics' }).click();
    await page.waitForSelector('.ref-pronoun', { timeout: 5000 });
  });

  await step('the cheat sheet opens over a running exercise without losing it', async () => {
    // The whole point of the sheet: reachable mid-session, and closing it
    // returns to exactly the card that was on screen — nothing in the queue
    // is disturbed by opening it.
    await clearLearn();
    await openFresh('#/session');
    await page.waitForSelector('.options .option', { timeout: 5000 });
    const promptBefore = await page.locator('#screen .screen__title, #screen .card__note').first().textContent();

    await page.getByRole('button', { name: 'Cheat sheet' }).click();
    await page.waitForSelector('.ref-sheet[open] .ref-pronoun', { timeout: 5000 });
    await shot('16e-cheat-sheet-in-session');

    await page.getByRole('button', { name: 'Close' }).click();
    await page.waitForSelector('.ref-sheet', { state: 'hidden', timeout: 5000 });
    // The router never ran — the same card, and the same options, are still there.
    await page.waitForSelector('.options .option', { timeout: 5000 });
    const promptAfter = await page.locator('#screen .screen__title, #screen .card__note').first().textContent();
    if (promptBefore !== promptAfter) throw new Error('the session moved on while the cheat sheet was open');
  });

  await step('learn hub separates receptive from productive mastery', async () => {
    await openFresh('#/learn');
    await page.waitForSelector('.topic-grid .topic-tile', { timeout: 5000 });
    // Named for what the exam asks, not for our scheduler. These used to read
    // "Understand" / "Say" over a caption of "12 of 47 holding" — two pieces
    // of internal vocabulary in one line, and "holding" is not a word anyone
    // outside this repo would use about a word they half-know.
    const bars = await page.locator('.card__note', { hasText: /^Can (follow|say) it$/ }).count();
    if (bars < 4) throw new Error(`expected two strand bars per deck, found ${bars}`);
    const jargon = await page.locator('#screen', { hasText: /\bholding\b/ }).count();
    if (jargon > 0) throw new Error('the learn hub still says "holding"');
    const tiles = await page.locator('.topic-tile').count();
    if (tiles < 10) throw new Error(`expected topic tiles for most of the taxonomy, found ${tiles}`);
    await shot('16-learn-hub');
  });

  await step('a beginner meets the sentence skeleton first, not random A1 nouns', async () => {
    await clearLearn();
    await openFresh('#/vocab');
    await page.waitForSelector('.options .option', { timeout: 5000 });

    const met = [];
    for (let guard = 0; guard < 6; guard += 1) {
      const word = await page.evaluate(() => document.querySelector('.card .screen__title')?.textContent?.trim());
      if (word) met.push(word);
      await page.locator('.options .option').first().click();
      const next = page.getByRole('button', { name: /^(Next|Finish)$/ });
      await next.waitFor({ state: 'visible', timeout: 3000 });
      if ((await next.textContent())?.trim() === 'Finish') break;
      await next.click();
    }
    // Stage 1 is 28 words, so a fresh learner's first cards must all come from
    // it. This is the regression guard on the ordering: before the deck was
    // ranked, the first card was as likely to be "Wunngemeinschaft" as "ech".
    const STAGE_ONE = ['ech', 'du', 'hien', 'si', 'hatt', 'mir', 'dir', 'jo', 'nee', 'net', 'wat', 'wien', 'wou',
      'wéini', 'firwat', 'an', 'awer', 'well', 'och', 'elo', 'haut', 'muer', 'gëschter', 'hei', 'vill', 'wéineg', 'gutt', 'schlecht'];
    const strays = met.filter((word) => !STAGE_ONE.includes(word.replace(/^(de|d')\s+/, '')));
    if (strays.length > 0) throw new Error(`first cards were not stage-one words: ${strays.join(', ')} (saw ${met.join(', ')})`);
    process.stdout.write(`  first words: ${met.join(', ')}\n`);
  });

  await step('the learn hub shows the path and where you are on it', async () => {
    await openFresh('#/learn');
    await page.waitForSelector('.stage', { timeout: 5000 });
    const stages = await page.locator('.stage').count();
    if (stages !== 5) throw new Error(`expected 5 stages, found ${stages}`);
    const current = await page.locator('.stage.is-current .card__title').textContent();
    if (current?.trim() !== 'First words') throw new Error(`a fresh learner should be on First words, not "${current}"`);
    await shot('16b-learn-path');
  });

  await step('tapping a step of the path actually starts that step', async () => {
    // The bug this guards: the path rows were plain divs. Tapping "First
    // words" did nothing at all, which reads as a broken app rather than as a
    // label — the row looks exactly like the way in.
    await clearLearn();
    await openFresh('#/learn');
    await page.waitForSelector('.stage', { timeout: 5000 });

    const first = page.locator('.stage').first();
    const href = await first.getAttribute('href');
    if (href !== '#/session/1') throw new Error(`the first step of the path leads to "${href}", not a session`);

    await first.click();
    await page.waitForSelector('.options .option', { timeout: 5000 });
    const title = (await page.locator('#screen .screen__title').first().textContent())?.trim();
    if (title !== 'First words') throw new Error(`the step session is titled "${title}"`);
    await shot('16c-stage-session');
  });

  await step("the day's practice counter only goes up", async () => {
    // The bug this guards: every number on Today was queue depth, and the
    // queue refills as you work — 101 cards answered took "8 words left" to 5,
    // then 10, then 10, then 8. There was nothing on the screen that could
    // tell a hard day's work from having done nothing at all.
    await clearLearn();
    const readCards = async () => {
      await openFresh('#/today');
      await page.waitForSelector('.plan', { timeout: 5000 });
      const note = (await page.locator('.plan').first().innerText()).trim();
      const match = note.match(/(\d+)\s+of\s+\d+\s+cards|Done — (\d+) cards?/);
      if (!match) throw new Error(`the Words step does not report a card count: "${note.replace(/\n/g, ' | ')}"`);
      return Number(match[1] ?? match[2]);
    };

    const before = await readCards();
    const counts = [before];
    for (let round = 0; round < 2; round += 1) {
      await openFresh('#/session');
      await page.waitForSelector('.options .option, .empty', { timeout: 5000 });
      for (let guard = 0; guard < 40; guard += 1) {
        const options = page.locator('.options .option');
        if ((await options.count()) === 0) break;
        await options.first().click();
        const next = page.getByRole('button', { name: /^(Next|Finish)$/ });
        await next.waitFor({ state: 'visible', timeout: 3000 });
        const label = (await next.textContent())?.trim();
        await next.click();
        if (label === 'Finish') break;
        await page.waitForTimeout(60);
      }
      counts.push(await readCards());
    }

    for (let i = 1; i < counts.length; i += 1) {
      if (counts[i] < counts[i - 1]) throw new Error(`the day's count went backwards: ${counts.join(' → ')}`);
    }
    if (counts.at(-1) <= counts[0]) throw new Error(`two sessions moved nothing: ${counts.join(' → ')}`);
    process.stdout.write(`  cards done today: ${counts.join(' → ')}\n`);
    await shot('00b-today-goal');
  });

  await step('one session moves the number the hub reports', async () => {
    // The bug this guards: progress was saved correctly, but the hub only ever
    // reported box-4 mastery against a 2,449-word deck. After a first session
    // every bar still sat at zero, which reads as "nothing was saved".
    await clearLearn();
    await openFresh('#/session');
    await page.waitForSelector('.options .option', { timeout: 5000 });

    let answered = 0;
    for (let guard = 0; guard < 8; guard += 1) {
      const options = page.locator('.options .option');
      if ((await options.count()) === 0) break;
      await options.first().click();
      answered += 1;
      const next = page.getByRole('button', { name: /^(Next|Finish)$/ });
      await next.waitFor({ state: 'visible', timeout: 3000 });
      const label = (await next.textContent())?.trim();
      await next.click();
      if (label === 'Finish' || answered >= 4) break;
    }
    if (answered === 0) throw new Error('the mixed session offered no cards at all');

    await openFresh('#/learn');
    await page.waitForSelector('.stage', { timeout: 5000 });
    const counter = (await page.locator('.stage').first().locator('.meter__value').textContent())?.trim() ?? '';
    const met = Number(counter.split('/')[0]);
    if (!(met > 0)) throw new Error(`answered ${answered} cards, but the path still reads ${counter}`);
    const width = await page.locator('.stage').first().locator('.meter__fill').evaluate((node) => node.style.width);
    if (width === '0%' || width === '') throw new Error(`the path bar is still empty after ${answered} cards (${width})`);
    process.stdout.write(`  after ${answered} cards the path reads ${counter} (bar ${width})\n`);
  });

  await step('vocabulary drill introduces a new word as a gloss choice', async () => {
    await openFresh('#/vocab');
    await page.waitForSelector('.options .option', { timeout: 5000 });
    await shot('17-drill-gloss');
    await page.locator('.options .option').first().click();
    await page.getByRole('button', { name: /^(Next|Finish)$/ }).waitFor({ timeout: 3000 });
  });

  // One well-known word, drilled to the point where it has to be typed.
  const TYPED_WORD = 'AARBECHT1';
  await step('a strong word escalates to a typed production card', async () => {
    await clearLearn();
    // Recognised well (box 4, not due) but only twice produced — which is
    // exactly the state the ladder answers with a typed card.
    await seedLearn('diego', 'vocab', 'recv', TYPED_WORD, 4, { due: false });
    await seedLearn('diego', 'vocab', 'prod', TYPED_WORD, 2);
    await openFresh('#/vocab');

    // Walk the session until the seeded word comes up as a typed card.
    //
    // The guard is generous because this bot answers by clicking the first
    // option, so it gets most cards wrong, and every miss re-queues a card
    // three places later. A twelve-card session can grow past twenty, which
    // can push the seeded word well beyond where it started.
    let sawField = false;
    for (let guard = 0; guard < 40 && !sawField; guard += 1) {
      await page.waitForSelector('.options .option, .field, .bank__tile', { timeout: 5000 });
      if ((await page.locator('.field').count()) > 0) {
        sawField = true;
        break;
      }
      if ((await page.locator('.bank__tile').count()) > 0) {
        await page.locator('.bank__tile').first().click();
        await page.getByRole('button', { name: 'Check' }).click();
      } else {
        await page.locator('.options .option').first().click();
      }
      const next = page.getByRole('button', { name: /^(Next|Finish)$/ });
      await next.waitFor({ state: 'visible', timeout: 3000 });
      if ((await next.textContent())?.trim() === 'Finish') break;
      await next.click();
    }
    if (!sawField) throw new Error('never reached a typed production card');
    await shot('18-drill-type');

    // The article picker is the only place gender is ever tested.
    if ((await page.locator('.chip--pick').count()) !== 2) throw new Error('noun production card is missing the de / d’ picker');
    await page.locator('.chip--pick').first().click();
    await page.locator('.field').fill('Aarbecht');
    await page.getByRole('button', { name: 'Check' }).click();
    await page.getByRole('button', { name: /^(Next|Finish)$/ }).waitFor({ timeout: 3000 });
    await shot('19-drill-type-answered');
  });

  await step('a missed card is re-queued inside the same session', async () => {
    await openFresh('#/vocab');
    await page.waitForSelector('.options .option, .field, .bank__tile', { timeout: 5000 });
    // Answer the first card wrong where possible, then look for the "again" chip.
    const wrong = page.locator('.options .option').filter({ hasNot: page.locator('.is-correct') });
    if ((await wrong.count()) > 0) {
      await wrong.first().click();
      await page.getByRole('button', { name: /^(Next|Finish)$/ }).click();
      // The retest lands a few cards later; walk forward looking for it.
      let sawRetry = false;
      for (let guard = 0; guard < 12 && !sawRetry; guard += 1) {
        if ((await page.locator('.chip', { hasText: 'again' }).count()) > 0) {
          sawRetry = true;
          break;
        }
        if ((await page.locator('.options .option').count()) === 0) break;
        await page.locator('.options .option').first().click();
        const next = page.getByRole('button', { name: /^(Next|Finish)$/ });
        await next.waitFor({ state: 'visible', timeout: 3000 });
        if ((await next.textContent())?.trim() === 'Finish') break;
        await next.click();
      }
      if (!sawRetry) throw new Error('a missed card never came back inside the session');
      await shot('20-drill-retest');
    }
  });

  await step('the phrase deck drills whole sentence frames', async () => {
    await clearLearn();
    await openFresh('#/phrases');
    await page.waitForSelector('.options .option', { timeout: 5000 });
    const frame = await page.evaluate(() => document.querySelector('.card .screen__title')?.textContent?.trim());
    if (!frame || !frame.includes(' ')) throw new Error(`expected a multi-word frame, got "${frame}"`);
    process.stdout.write(`  first frame: ${frame}\n`);
    await shot('22-phrases');
  });

  await step('a known frame is rebuilt from a word bank, not letters', async () => {
    await clearLearn();
    const FRAME = 'PHRASE-ECH-HUNN';
    await seedLearn('diego', 'phrase', 'recv', FRAME, 4, { due: false });
    await seedLearn('diego', 'phrase', 'prod', FRAME, 1);
    await openFresh('#/phrases');

    let sawBank = false;
    for (let guard = 0; guard < 40 && !sawBank; guard += 1) {
      await page.waitForSelector('.options .option, .bank__tile, .field', { timeout: 5000 });
      if ((await page.locator('.bank__tile').count()) > 0) {
        sawBank = true;
        break;
      }
      if ((await page.locator('.field').count()) > 0) {
        await page.locator('.field').fill('x');
        await page.getByRole('button', { name: 'Check' }).click();
      } else {
        await page.locator('.options .option').first().click();
      }
      const next = page.getByRole('button', { name: /^(Next|Finish)$/ });
      await next.waitFor({ state: 'visible', timeout: 3000 });
      if ((await next.textContent())?.trim() === 'Finish') break;
      await next.click();
    }
    if (!sawBank) throw new Error('never reached the word-bank card');

    // Word tiles, not letter tiles: a letter bank cannot express the space.
    const tiles = await page.locator('.bank__tile').allTextContents();
    if (!tiles.some((tile) => tile.trim().length > 1)) throw new Error(`expected whole words, got letters: ${tiles.join(' ')}`);
    await shot('23-phrase-bank');
  });

  await step('a topic-scoped session only draws from that topic', async () => {
    await openFresh('#/vocab/stot');
    await page.waitForSelector('.screen__sub', { timeout: 5000 });
    const sub = await page.locator('.screen__sub').first().textContent();
    if (!/this topic/.test(sub ?? '')) throw new Error(`topic session did not announce itself: ${sub}`);
    await shot('21-drill-topic');
  });

  await step('the right-answer chime makes sound, and never over a recording', async () => {
    const measured = await page.evaluate(async () => {
      const fresh = () => import(`./js/chime.js?probe=${Math.random()}`);
      const { Clip } = await import('./js/audio.js');
      const sampleRate = 44100;

      // A fresh module per render: chime.js caches one AudioContext for the
      // life of the app, which is right for the app and wrong for a probe that
      // needs to render several times.
      const render = async (enabled) => {
        const chime = await fresh();
        const ctx = new OfflineAudioContext(1, sampleRate, sampleRate);
        const Real = window.AudioContext;
        window.AudioContext = function () { return ctx; };
        chime.setChimeEnabled(enabled);
        chime.chimeCorrect();
        window.AudioContext = Real;
        const data = (await ctx.startRendering()).getChannelData(0);
        let peak = 0;
        for (let i = 0; i < data.length; i += 1) peak = Math.max(peak, Math.abs(data[i]));
        return peak;
      };

      const withSound = await render(true);
      const muted = await render(false);

      // The guard that matters: a chime mixed on top of a native recording
      // would degrade the exact skill the B1 half is scored on.
      const clip = new Clip('probe-does-not-exist');
      Object.defineProperty(clip, 'isPlaying', { get: () => true });
      const overSpeech = await render(true);
      clip.destroy();
      const afterDestroy = await render(true);

      return { withSound, muted, overSpeech, afterDestroy };
    });

    if (!(measured.withSound > 0.01)) throw new Error(`the chime produced no signal (peak ${measured.withSound})`);
    if (measured.withSound > 1) throw new Error(`the chime clips (peak ${measured.withSound})`);
    if (measured.muted !== 0) throw new Error('the chime still sounded with sound switched off');
    if (measured.overSpeech !== 0) throw new Error('the chime played over a recording that was still running');
    if (!(measured.afterDestroy > 0.01)) throw new Error('the chime stayed muted after the clip was destroyed');
    process.stdout.write(`  chime peak ${measured.withSound.toFixed(3)}, silent while a clip plays\n`);
  });

  await step('settings can switch the sound off, and it sticks', async () => {
    await openFresh('#/settings');
    await page.waitForSelector('#sound', { timeout: 5000 });
    if (!(await page.locator('#sound').isChecked())) throw new Error('sound should default to on');
    await page.locator('#sound').uncheck();
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForSelector('text=Saved.', { timeout: 5000 });

    await openFresh('#/settings');
    await page.waitForSelector('#sound', { timeout: 5000 });
    if (await page.locator('#sound').isChecked()) throw new Error('the sound setting did not persist');
    // Put it back so the rest of the run behaves normally.
    await page.locator('#sound').check();
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForSelector('text=Saved.', { timeout: 5000 });
  });

  await step('settings takes an Anthropic API key and rejects a bad one', async () => {
    await openFresh('#/settings');
    await page.waitForSelector('#apikey', { timeout: 5000 });
    await page.fill('#apikey', 'not-a-key');
    await page.getByRole('button', { name: 'Save' }).click();
    const rejected = await page.locator('#screen [role="status"]').textContent();
    if (!/does not look like/.test(rejected ?? '')) throw new Error(`a bad key was not rejected: ${rejected}`);

    await page.fill('#apikey', 'sk-ant-api03-0000000000000000000000000000');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForFunction(() => document.querySelector('#screen [role="status"]')?.textContent === 'Saved.', { timeout: 3000 });

    const stored = await page.evaluate(async () => (await (await import('./js/store.js')).getSettings()).apiKey);
    if (!stored?.startsWith('sk-ant-')) throw new Error('the key was not persisted');
    await shot('24-settings');
    // Leave no key behind — later steps must not accidentally call the API.
    await page.evaluate(async () => { await (await import('./js/store.js')).saveSettings({ apiKey: '' }); });
  });

  await step('an API key in settings makes explanations work, with no Worker', async () => {
    // The real endpoint is never called. Intercepting it is what lets this
    // assert the exact request the app builds — key placement, the browser
    // access header, the model — which is the part that silently breaks.
    let seen = null;
    await page.route('**://api.anthropic.com/**', async (route) => {
      const request = route.request();
      seen = { headers: request.headers(), body: JSON.parse(request.postData() ?? '{}') };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content: [{ type: 'text', text: '{"translation":"I have had enough of this!","explanation":"Word order is verb-second here."}' }] }),
      });
    });

    await openFresh('#/settings');
    await page.fill('#apikey', 'sk-ant-api03-0000000000000000000000000000');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForFunction(() => document.querySelector('#screen [role="status"]')?.textContent === 'Saved.', { timeout: 3000 });

    const result = await page.evaluate(async () => {
      const [{ getSettings }, { requestExplanation }] = await Promise.all([
        import('./js/store.js'),
        import('./js/sync.js'),
      ]);
      return requestExplanation(await getSettings(), { lb: "ech hunn d'Nues voll!", word: 'hunn', en: 'to have' });
    });

    if (!result.ok) throw new Error(`explanation failed: ${result.message}`);
    if (!/verb-second/.test(result.explanation)) throw new Error(`unexpected explanation: ${result.explanation}`);
    if (seen?.headers['x-api-key'] !== 'sk-ant-api03-0000000000000000000000000000') throw new Error('the key was not sent as x-api-key');
    if (seen?.headers['anthropic-dangerous-direct-browser-access'] !== 'true') throw new Error('the browser-access header is missing — the preflight would be refused');
    if (!seen?.headers['anthropic-version']) throw new Error('anthropic-version header is missing');
    if (!seen?.body.model) throw new Error('no model in the request body');
    process.stdout.write(`  explain model: ${seen.body.model}\n`);

    await page.unroute('**://api.anthropic.com/**');
    await page.evaluate(async () => { await (await import('./js/store.js')).saveSettings({ apiKey: '' }); });
  });

  await step('a word-order card offers an explanation, asked as word order', async () => {
    // These cards had no explain button at all: the engine looked for a
    // sentence on the prompt, and a word-order card deliberately renders no
    // prompt — its three options *are* the sentence. So the one card shape
    // whose answer is least self-evident was the one that could not be asked
    // about.
    let sent = null;
    await page.route('**://api.anthropic.com/**', async (route) => {
      sent = JSON.parse(route.request().postData() ?? '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content: [{ type: 'text', text: '{"translation":"I have got conjunctivitis in my left eye.","explanation":"hunn comes straight after ech."}' }] }),
      });
    });
    await page.evaluate(async () => {
      await (await import('./js/store.js')).saveSettings({ apiKey: 'sk-ant-api03-0000000000000000000000000000', workerUrl: '' });
    });

    await clearLearn();
    await openFresh('#/grammar/wordorder');
    await page.waitForSelector('.options .option', { timeout: 5000 });
    await page.locator('.options .option').first().click();

    const explain = page.getByRole('button', { name: /right order/i });
    await explain.waitFor({ state: 'visible', timeout: 3000 });
    await explain.click();
    await page.waitForFunction(() => /hunn comes straight after/.test(document.querySelector('#screen')?.textContent ?? ''), { timeout: 5000 });

    // The translation leads. An observation about where the verb sits lands on
    // nothing if the learner cannot read the sentence it is about.
    const translated = (await page.locator('.drill__translation').first().textContent())?.trim();
    if (translated !== 'I have got conjunctivitis in my left eye.') throw new Error(`translation not shown first: ${translated}`);
    const translationFirst = await page.evaluate(() => {
      const first = document.querySelector('#screen .drill__translation');
      const prose = [...document.querySelectorAll('#screen p')].find((node) => /hunn comes straight after/.test(node.textContent));
      // 4 = DOCUMENT_POSITION_FOLLOWING: the prose comes after the translation.
      return Boolean(first && prose && first.compareDocumentPosition(prose) & 4);
    });
    if (!translationFirst) throw new Error('the explanation is rendered above the translation');

    const prompt = sent?.messages?.[0]?.content ?? '';
    const system = sent?.system ?? '';
    if (/Sentence: (null|undefined)/.test(prompt)) throw new Error(`sent a non-sentence as the sentence:\n${prompt}`);
    if (!/The exercise they just answered:.*where the conjugated verb goes/s.test(prompt)) {
      throw new Error(`the explainer was not told this was a word-order question:\n${prompt}`);
    }
    if (!/only word that moves/.test(prompt)) throw new Error(`the explainer was not told which word moved:\n${prompt}`);
    if (!/wrong orders they could have picked/.test(prompt)) throw new Error('the explainer was not given the wrong orders');
    if (!/never studied grammar/.test(system)) throw new Error('the plain-language instruction is missing from the system prompt');
    await shot('00d-structure-explain');

    await page.unroute('**://api.anthropic.com/**');
    await page.evaluate(async () => { await (await import('./js/store.js')).saveSettings({ apiKey: '' }); });
  });

  await step('the podcast index lists real INLL episodes by level', async () => {
    await openFresh('#/podcasts');
    await page.waitForSelector('a[href^="#/podcasts/"]', { timeout: 5000 });
    const rows = await page.locator('a[href^="#/podcasts/"]').count();
    if (rows !== 3) throw new Error(`expected the 3 fixture episodes, found ${rows}`);
    const levels = (await page.locator('#screen .meter__label').allTextContents()).map((text) => text.trim());
    if (!levels.includes('A2') || !levels.includes('B1')) throw new Error(`episodes not grouped by level: ${levels.join(', ')}`);

    // Whether an episode can ask questions is a reason to pick it, so it has
    // to be legible from the list — exactly one fixture episode lacks a
    // transcript.
    const listenOnly = await page.locator('a[href^="#/podcasts/"] .chip', { hasText: 'listen only' }).count();
    if (listenOnly !== 1) throw new Error(`expected 1 "listen only" episode marked in the list, found ${listenOnly}`);

    // Levels are in CEFR order, not the order the feed happened to arrive in.
    const ordered = levels.filter((text) => /^[ABC][12](-[ABC][12])?$/.test(text));
    if (ordered.join(',') !== [...ordered].sort().join(',')) {
      throw new Error(`level sections are not in CEFR order: ${ordered.join(', ')}`);
    }
    await shot('25-podcasts');
  });

  await step('the podcast filters narrow by level and drop the listen-only episodes', async () => {
    await openFresh('#/podcasts');
    await page.waitForSelector('a[href^="#/podcasts/"]', { timeout: 5000 });

    // "With questions" hides the one fixture episode that has no transcript.
    await page.locator('.chip--pick', { hasText: 'With questions' }).click();
    await page.waitForFunction(() => document.querySelectorAll('a[href^="#/podcasts/"]').length === 2, { timeout: 5000 });
    const stillListenOnly = await page.locator('a[href^="#/podcasts/"] .chip', { hasText: 'listen only' }).count();
    if (stillListenOnly !== 0) throw new Error('a listen-only episode survived the "with questions" filter');

    // A level chip narrows further — one of the two remaining is A2.
    await page.locator('.chip--pick', { hasText: 'A2' }).first().click();
    await page.waitForFunction(() => document.querySelectorAll('a[href^="#/podcasts/"]').length === 1, { timeout: 5000 });
    await shot('25c-podcasts-filtered');

    // The choice survives a reload — a filter you have to reapply every visit
    // is not a filter.
    await openFresh('#/podcasts');
    await page.waitForSelector('a[href^="#/podcasts/"]', { timeout: 5000 });
    const remembered = await page.locator('a[href^="#/podcasts/"]').count();
    if (remembered !== 1) throw new Error(`filters did not persist across a reload, ${remembered} rows showed`);

    // And can be cleared back to the whole catalogue.
    await page.locator('.chip--pick', { hasText: 'All levels' }).click();
    await page.locator('.chip--pick', { hasText: 'With questions' }).click();
    await page.waitForFunction(() => document.querySelectorAll('a[href^="#/podcasts/"]').length === 3, { timeout: 5000 });
  });

  await step('an episode with no transcript says so instead of offering questions', async () => {
    // INLL publishes a transcript for about half its episodes. Offering a
    // button that cannot work would read as a bug in the app rather than as a
    // property of the source.
    await openFresh('#/podcasts/pod-test0003');
    await page.waitForSelector('#screen .btn--primary', { timeout: 5000 });
    if (await page.getByRole('button', { name: 'Ask me questions' }).count()) {
      throw new Error('an episode with no transcript still offers questions');
    }
    if (!(await page.locator('.card__title', { hasText: 'Listening only' }).first().isVisible())) {
      throw new Error('the screen does not explain why there are no questions');
    }
    await shot('25b-podcast-listen-only');
  });

  await step('an episode streams from the publisher, and not before it is asked for', async () => {
    // `Clip` keeps its <audio> element detached, so there is nothing in the DOM
    // to inspect. The properties worth asserting are behavioural anyway: where
    // the bytes come from, and that none are pulled until someone taps Play.
    let hits = 0;
    await page.route('**cdn.example/**', async (route) => {
      hits += 1;
      await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.alloc(64) });
    });

    // Opened here rather than inherited from the step before: this walks from
    // the index into an episode, so it has to start on the index whatever the
    // previous step left on screen.
    await openFresh('#/podcasts');
    await page.waitForSelector('a[href^="#/podcasts/"]', { timeout: 5000 });
    await page.locator('a[href^="#/podcasts/"]').first().click();
    await page.waitForSelector('#screen .btn--primary', { timeout: 5000 });
    await page.waitForTimeout(400);
    if (hits !== 0) throw new Error(`the episode started downloading on render (${hits} requests) — preload should be none`);

    await page.locator('#screen .btn--primary').first().click();
    await page.waitForTimeout(600);
    if (hits === 0) throw new Error('tapping play fetched nothing from the publisher');
    await shot('26-podcast-episode');

    await page.unroute('**cdn.example/**');
  });

  await step('episode questions render, score, and are labelled machine-made', async () => {
    // The Worker is what generates these — a browser cannot read a transcript
    // cross-origin — so the Worker is what gets stubbed.
    await page.route('**/episode-questions**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          via: 'published',
          questions: [
            { question_en: 'What is free since 2020?', options_lb: ['de Bus ass gratis', 'moien alleguer'], correct: 0 },
            { question_en: 'What is the episode about?', options_lb: ['den ëffentlechen Transport', 'de Bus ass gratis'], correct: 0 },
          ],
        }),
      });
    });
    await page.evaluate(async () => {
      await (await import('./js/store.js')).saveSettings({ workerUrl: 'https://worker.example' });
    });

    await openFresh('#/podcasts/pod-test0001');
    await page.getByRole('button', { name: 'Ask me questions' }).click();
    await page.waitForSelector('.options .option', { timeout: 5000 });

    if (!(await page.locator('.chip', { hasText: 'machine-made' }).first().isVisible())) {
      throw new Error('generated questions are not labelled as machine-made');
    }

    for (let guard = 0; guard < 5; guard += 1) {
      const options = page.locator('.options .option');
      if ((await options.count()) === 0) break;
      await options.first().click();
      const next = page.getByRole('button', { name: /^(Next|Finish)$/ });
      await next.waitFor({ state: 'visible', timeout: 3000 });
      const label = (await next.textContent())?.trim();
      await next.click();
      if (label === 'Finish') break;
      await page.waitForTimeout(80);
    }
    await page.waitForSelector('text=This episode', { timeout: 5000 });
    await shot('27-podcast-questions');

    // It counted as listening — which is the whole argument for using real
    // connected speech rather than dictionary clips.
    const logged = await page.evaluate(() => new Promise((resolve) => {
      const open = indexedDB.open('sproochentest');
      open.onsuccess = () => {
        const all = open.result.transaction('attempts', 'readonly').objectStore('attempts').getAll();
        all.onsuccess = () => resolve(all.result.filter((row) => row.topic === 'podcast').length);
      };
    }));
    if (logged !== 1) throw new Error(`expected one podcast attempt logged, found ${logged}`);

    await page.unroute('**/episode-questions**');
    await page.evaluate(async () => {
      await (await import('./js/store.js')).saveSettings({ workerUrl: '' });
    });
  });

  await step('a passed episode is marked on the index and can be hidden', async () => {
    // The step above scored 2/2 on pod-test0001. Knowing that without opening
    // the episode again is the whole point — otherwise the only way to find
    // out whether you have done one is to do it twice.
    await openFresh('#/podcasts');
    await page.waitForSelector('a[href^="#/podcasts/"]', { timeout: 5000 });

    const passedChips = await page.locator('a[href^="#/podcasts/"] .chip', { hasText: 'passed' }).count();
    if (passedChips !== 1) throw new Error(`expected the passed episode to be marked once, found ${passedChips}`);
    const row = page.locator('a[href="#/podcasts/pod-test0001"]');
    const rowText = (await row.textContent()) ?? '';
    if (!/2\/2/.test(rowText)) throw new Error(`expected the score on the row, got "${rowText.trim()}"`);
    await shot('25d-podcasts-passed');

    // And it can be taken out of the way entirely.
    await page.locator('.chip--pick', { hasText: 'Hide passed' }).click();
    await page.waitForFunction(() => document.querySelectorAll('a[href^="#/podcasts/"]').length === 2, { timeout: 5000 });
    if (await page.locator('a[href="#/podcasts/pod-test0001"]').count()) {
      throw new Error('the passed episode survived "hide passed"');
    }
    await page.locator('.chip--pick', { hasText: 'Hide passed' }).click();
    await page.waitForFunction(() => document.querySelectorAll('a[href^="#/podcasts/"]').length === 3, { timeout: 5000 });
  });

  await step('without a Worker, the screen says why rather than failing', async () => {
    await openFresh('#/podcasts/pod-test0002');
    await page.getByRole('button', { name: 'Ask me questions' }).click();
    await page.waitForSelector('text=/Questions need the Worker/', { timeout: 5000 });
  });

  await step('duel scoreboard renders both players', async () => {
    await page.goto(`${base}#/duel`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.scoreboard', { timeout: 5000 });
    const sides = await page.locator('.scoreboard__side').count();
    if (sides !== 2) throw new Error(`expected 2 sides, found ${sides}`);
    await shot('14-duel');
  });

  await step('dark mode renders', async () => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(`${base}#/journey`, { waitUntil: 'networkidle' });
    await shot('15-journey-dark');
    await page.emulateMedia({ colorScheme: 'light' });
  });

  await step('nothing scrolls horizontally at iPhone width', async () => {
    for (const route of ['journey', 'readiness', 'duel', 'speaking']) {
      await page.goto(`${base}#/${route}`, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) throw new Error(`#/${route} overflows by ${overflow}px`);
    }
  });

  await browser.close();
  server.close();

  process.stdout.write(`\n${results.join('\n')}\n`);
  // ERR_ABORTED is not a failure: it means a request was still in flight when
  // we navigated or moved to the next card. The walkthrough drives the app far
  // faster than a person does, so it aborts the splash icon on reload and the
  // odd example-sentence clip when it skips past a listening card. A real
  // broken asset shows up as ERR_FAILED or a 404, which is still caught.
  const noisy = problems.filter((problem) => !/favicon|manifest/i.test(problem) && !/ERR_ABORTED/.test(problem));
  if (noisy.length > 0) {
    process.stdout.write(`\nBrowser problems (${noisy.length}):\n${[...new Set(noisy)].slice(0, 15).map((p) => `  ${p}`).join('\n')}\n`);
  }
  process.stdout.write(`\nScreenshots in ${path.relative(paths.ROOT, outDir)}\n`);

  const failed = results.filter((line) => line.startsWith('FAIL'));
  if (failed.length > 0 || noisy.length > 0) process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`walkthrough failed: ${error.stack}\n`);
  process.exit(1);
});
