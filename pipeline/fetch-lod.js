#!/usr/bin/env node
'use strict';

/**
 * Pulls and caches the three LOD open-data exports from data.public.lu.
 *
 * All three are CC0, published by the Zenter fir d'Lëtzebuerger Sprooch. We
 * resolve the newest resource per dataset through the data.public.lu API
 * rather than hard-coding a dated URL, and record the resolved id + checksum
 * in the cache manifest so a corpus build is reproducible and auditable.
 *
 *   node pipeline/fetch-lod.js [--force]
 *
 * Output: .cache/lod/*.xml plus .cache/lod/manifest.json (both gitignored -
 * they are 200 MB of upstream data, and the manifest pins what produced the
 * committed corpus).
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const { CACHE_DIR, MANIFEST_PATH, DATASETS } = require('./lib/paths');

const API = 'https://data.public.lu/api/1';

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status} ${response.statusText}`);
  return response.json();
}

/** Newest resource of a dataset, by the export date encoded in its filename. */
async function resolveLatestResource(slug) {
  const dataset = await getJson(`${API}/datasets/${slug}/`);
  const candidates = dataset.resources.filter((resource) => resource.format === 'zip');
  if (candidates.length === 0) throw new Error(`no zip resource on dataset ${slug}`);
  candidates.sort((a, b) => String(b.title).localeCompare(String(a.title)));
  const resource = candidates[0];
  return {
    datasetSlug: slug,
    datasetTitle: dataset.title,
    license: dataset.license,
    resourceId: resource.id,
    resourceTitle: resource.title,
    url: resource.url,
    filesize: resource.filesize,
    lastModified: resource.last_modified,
  };
}

/**
 * Extracts the single XML member of a LOD zip.
 *
 * Each of the three archives contains exactly one stored-or-deflated file, so
 * a full zip implementation is not needed: read the end-of-central-directory
 * record, walk the central directory, and inflate. Anything unexpected throws.
 */
function unzipSingleMember(buffer) {
  const eocdSignature = 0x06054b50;
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 22 - 0xffff; i -= 1) {
    if (buffer.readUInt32LE(i) === eocdSignature) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('not a zip archive: no end-of-central-directory record');

  const entryCount = buffer.readUInt16LE(eocd + 10);
  if (entryCount !== 1) throw new Error(`expected 1 file in archive, found ${entryCount}`);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (buffer.readUInt32LE(centralOffset) !== 0x02014b50) throw new Error('bad central directory header');

  const method = buffer.readUInt16LE(centralOffset + 10);
  const compressedSize = buffer.readUInt32LE(centralOffset + 20);
  const uncompressedSize = buffer.readUInt32LE(centralOffset + 24);
  const nameLength = buffer.readUInt16LE(centralOffset + 28);
  const extraLength = buffer.readUInt16LE(centralOffset + 30);
  const commentLength = buffer.readUInt16LE(centralOffset + 32);
  const localOffset = buffer.readUInt32LE(centralOffset + 42);
  const name = buffer.toString('utf8', centralOffset + 46, centralOffset + 46 + nameLength);
  void extraLength;
  void commentLength;

  if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('bad local file header');
  const localNameLength = buffer.readUInt16LE(localOffset + 26);
  const localExtraLength = buffer.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + localNameLength + localExtraLength;
  const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

  let contents;
  if (method === 0) contents = compressed;
  else if (method === 8) contents = zlib.inflateRawSync(compressed, { maxOutputLength: uncompressedSize + 1024 });
  else throw new Error(`unsupported zip compression method ${method}`);

  if (contents.length !== uncompressedSize) {
    throw new Error(`size mismatch for ${name}: expected ${uncompressedSize}, got ${contents.length}`);
  }
  return { name, contents };
}

async function fetchDataset(key, spec, { force }) {
  const target = path.join(CACHE_DIR, `${key}.xml`);
  const resource = await resolveLatestResource(spec.slug);

  const previous = await readManifest();
  const cached = previous?.datasets?.[key];
  if (!force && cached && cached.resourceId === resource.resourceId && fs.existsSync(target)) {
    const stat = await fsp.stat(target);
    if (stat.size === cached.xmlBytes) {
      process.stdout.write(`  ${key}: cached (${resource.resourceTitle})\n`);
      return { ...cached, ...resource };
    }
  }

  process.stdout.write(`  ${key}: downloading ${resource.resourceTitle} …`);
  const response = await fetch(resource.url);
  if (!response.ok) throw new Error(`GET ${resource.url} -> ${response.status}`);
  const archive = Buffer.from(await response.arrayBuffer());
  const zipSha256 = crypto.createHash('sha256').update(archive).digest('hex');
  const { name, contents } = unzipSingleMember(archive);
  await fsp.writeFile(target, contents);
  process.stdout.write(` ${(contents.length / 1e6).toFixed(1)} MB\n`);

  return {
    ...resource,
    member: name,
    zipBytes: archive.length,
    zipSha256,
    xmlBytes: contents.length,
    xmlSha256: crypto.createHash('sha256').update(contents).digest('hex'),
    fetchedAt: new Date().toISOString(),
  };
}

async function readManifest() {
  try {
    return JSON.parse(await fsp.readFile(MANIFEST_PATH, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const force = process.argv.includes('--force');
  await fsp.mkdir(CACHE_DIR, { recursive: true });

  process.stdout.write('Fetching LOD open data (CC0, Zenter fir d\'Lëtzebuerger Sprooch)\n');
  const datasets = {};
  for (const [key, spec] of Object.entries(DATASETS)) {
    datasets[key] = await fetchDataset(key, spec, { force });
  }

  const manifest = { generatedAt: new Date().toISOString(), source: API, datasets };
  await fsp.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`Manifest written to ${path.relative(process.cwd(), MANIFEST_PATH)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`fetch-lod failed: ${error.message}\n`);
    process.exit(1);
  });
}

module.exports = { unzipSingleMember, resolveLatestResource };
