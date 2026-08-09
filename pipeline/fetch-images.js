#!/usr/bin/env node
'use strict';

/**
 * Sources images for the A2 image-description task (part 2b).
 *
 * INLL's own exam images are copyrighted and are never mirrored — the app
 * links to their published examples instead. What we can ship is openly
 * licensed photography of the same kind of subject: everyday scenes in
 * Luxembourg, which is what the brief asks for over stock abstraction.
 *
 * Wikimedia Commons is the source because it publishes machine-readable
 * licence and author metadata per file, so every image can carry a correct
 * credit. Anything without a free licence we recognise is skipped rather than
 * guessed at.
 *
 *   node pipeline/fetch-images.js [--per N] [--dry]
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const paths = require('./lib/paths');
const { writeJson } = require('./lib/write-json');
const { API, stripHtml, politeFetch, isFree } = require('./lib/wikimedia');

const IMAGE_DIR = path.join(paths.ROOT, 'app', 'assets', 'img');
const THUMB_WIDTH = 1024;

/** Commons categories that actually depict the exam's topic pool. */
const SOURCES = [
  { topic: 'iessen', category: 'Category:Markets in Luxembourg' },
  { topic: 'iessen', category: 'Category:Restaurants in Luxembourg' },
  { topic: 'transport', category: 'Category:Public transport in Luxembourg' },
  { topic: 'transport', category: 'Category:Cycling in Luxembourg' },
  { topic: 'sport', category: 'Category:Sport in Luxembourg' },
  { topic: 'wunnen', category: 'Category:Houses in Luxembourg' },
  { topic: 'hobbyen', category: 'Category:Parks in Luxembourg' },
  { topic: 'feierdeeg', category: 'Category:Christmas markets in Luxembourg' },
  { topic: 'joreszäiten', category: 'Category:Winter in Luxembourg' },
  { topic: 'aarbecht', category: 'Category:Shops in Luxembourg' },
  { topic: 'famill', category: 'Category:People of Luxembourg' },
  { topic: 'liesen', category: 'Category:Libraries in Luxembourg' },
];

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

async function fetchCategory(category, limit) {
  const url = new URL(API);
  url.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'categorymembers',
    gcmtitle: category,
    gcmtype: 'file',
    gcmlimit: String(limit * 4), // over-fetch: most get filtered out
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size|mime',
    iiurlwidth: String(THUMB_WIDTH),
  });

  const response = await politeFetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  return Object.values(payload.query?.pages ?? {});
}

function toImage(page, topic) {
  const info = page.imageinfo?.[0];
  if (!info || !info.thumburl) return null;
  if (!/^image\/(jpeg|png|webp)$/.test(info.mime ?? '')) return null;

  const meta = info.extmetadata ?? {};
  const licence = stripHtml(meta.LicenseShortName?.value);
  if (!isFree(licence)) return null;

  // Landscape only: an exam image is described, not scrolled.
  if (info.width && info.height && info.width / info.height < 1.15) return null;

  const title = page.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replace(/[_-]+/g, ' ');
  return {
    id: `img-${page.pageid}`,
    type: 'image',
    topic,
    title_en: title.slice(0, 80),
    imageUrl: info.thumburl,
    imageCredit: stripHtml(meta.Artist?.value).slice(0, 80) || 'Unknown',
    imageLicence: licence,
    imageSource: info.descriptionurl ?? `https://commons.wikimedia.org/?curid=${page.pageid}`,
  };
}

async function main() {
  const per = readArg('--per', 2);
  const dry = process.argv.includes('--dry');

  const picked = [];
  const seen = new Set();

  for (const source of SOURCES) {
    let pages;
    try {
      pages = await fetchCategory(source.category, per);
    } catch (error) {
      process.stderr.write(`  ${source.category}: ${error.message}\n`);
      continue;
    }
    let taken = 0;
    for (const page of pages) {
      if (taken >= per) break;
      const image = toImage(page, source.topic);
      if (!image || seen.has(image.id)) continue;
      seen.add(image.id);
      picked.push(image);
      taken += 1;
    }
    process.stdout.write(`  ${source.category.replace('Category:', '').padEnd(38)} ${taken}/${per}\n`);
  }

  if (dry) {
    process.stdout.write(`${picked.length} images would be mirrored\n`);
    return;
  }

  await fsp.mkdir(IMAGE_DIR, { recursive: true });
  const items = [];
  let bytes = 0;

  for (const image of picked) {
    const file = `${image.id}.jpg`;
    const target = path.join(IMAGE_DIR, file);
    if (!fs.existsSync(target)) {
      try {
        const response = await politeFetch(image.imageUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await fsp.writeFile(target, Buffer.from(await response.arrayBuffer()));
      } catch (error) {
        process.stderr.write(`  ${image.id}: ${error.message}\n`);
        continue;
      }
    }
    bytes += fs.statSync(target).size;
    // Point the app at the mirrored copy so part 2b works offline too.
    items.push({ ...image, imageUrl: `assets/img/${file}` });
  }

  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      generator: 'pipeline/fetch-images.js',
      source: 'Wikimedia Commons',
      note:
        'Openly licensed photographs of everyday scenes in Luxembourg, used for the A2 image-description ' +
        'task. INLL exam images are copyrighted and are not reproduced; the app links to their published ' +
        'examples instead. Every image keeps its author and licence.',
      count: items.length,
      bytes,
    },
    items,
  };

  await writeJson(path.join(paths.ITEMS_DIR, 'images.json'), payload);
  await writeJson(path.join(paths.ROOT, 'app', 'data', 'images.json'), payload);
  process.stdout.write(`Mirrored ${items.length} images, ${(bytes / 1e6).toFixed(1)} MB\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`fetch-images failed: ${error.stack}\n`);
    process.exit(1);
  });
}
