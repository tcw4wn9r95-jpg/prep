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

function serve(root) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    let filePath = path.join(root, decodeURIComponent(url.pathname));
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
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
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

  await step(`answered all 16 questions (got ${questionCount})`, async () => {
    if (questionCount !== 16) throw new Error(`expected 16 questions, answered ${questionCount}`);
  });

  await step('speaking offers exactly two topics, as the exam does', async () => {
    await page.goto(`${base}#/speaking`, { waitUntil: 'networkidle' });
    await page.waitForSelector('a.card', { timeout: 5000 });
    const offered = await page.locator('a.card[href^="#/speaking/"]:not([href*="/image"])').count();
    if (offered !== 2) throw new Error(`expected 2 topics offered, found ${offered}`);
    await shot('06-speaking-choose');
  });

  await step('interview shows prep timer then records', async () => {
    await page.locator('a.card[href^="#/speaking/"]:not([href*="/image"])').first().click();
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

  await step('learn hub separates receptive from productive mastery', async () => {
    await openFresh('#/learn');
    await page.waitForSelector('.topic-grid .topic-tile', { timeout: 5000 });
    const bars = await page.locator('.card__note', { hasText: /^(Understand|Say)$/ }).count();
    if (bars < 4) throw new Error(`expected two strand bars per deck, found ${bars}`);
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
    let sawField = false;
    for (let guard = 0; guard < 14 && !sawField; guard += 1) {
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

  await step('a topic-scoped session only draws from that topic', async () => {
    await openFresh('#/vocab/stot');
    await page.waitForSelector('.screen__sub', { timeout: 5000 });
    const sub = await page.locator('.screen__sub').first().textContent();
    if (!/this topic/.test(sub ?? '')) throw new Error(`topic session did not announce itself: ${sub}`);
    await shot('21-drill-topic');
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
