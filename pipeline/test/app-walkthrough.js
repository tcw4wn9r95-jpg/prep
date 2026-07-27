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
  const noisy = problems.filter((problem) => !/favicon|manifest/i.test(problem));
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
