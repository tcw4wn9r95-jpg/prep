'use strict';

/**
 * Generated content is committed, so it has to diff well. `JSON.stringify(v, null, 2)`
 * is fine for the nested parts, but a 110k-key map indented two levels deep
 * makes every review scroll. `writeJsonWithLineDelimitedMap` emits the named
 * top-level maps as one `"key": "value",` per line at a fixed indent, which
 * gives git a clean per-form line granularity.
 */

const fsp = require('node:fs/promises');
const path = require('node:path');

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonWithLineDelimitedMap(file, value, mapKeys) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const handle = await fsp.open(file, 'w');
  try {
    const keys = Object.keys(value);
    await handle.write('{\n');
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const comma = i === keys.length - 1 ? '' : ',';
      if (mapKeys.includes(key)) {
        const entries = Object.entries(value[key]);
        if (entries.length === 0) {
          await handle.write(`  ${JSON.stringify(key)}: {}${comma}\n`);
          continue;
        }
        await handle.write(`  ${JSON.stringify(key)}: {\n`);
        // Batched so a 110k-entry map is a handful of writes, not 110k.
        let chunk = '';
        for (let j = 0; j < entries.length; j += 1) {
          const [name, entryValue] = entries[j];
          chunk += `    ${JSON.stringify(name)}: ${JSON.stringify(entryValue)}${j === entries.length - 1 ? '' : ','}\n`;
          if (chunk.length > 1 << 20) {
            await handle.write(chunk);
            chunk = '';
          }
        }
        if (chunk !== '') await handle.write(chunk);
        await handle.write(`  }${comma}\n`);
      } else {
        const body = JSON.stringify(value[key], null, 2)
          .split('\n')
          .map((line, index) => (index === 0 ? line : `  ${line}`))
          .join('\n');
        await handle.write(`  ${JSON.stringify(key)}: ${body}${comma}\n`);
      }
    }
    await handle.write('}\n');
  } finally {
    await handle.close();
  }
}

module.exports = { writeJson, writeJsonWithLineDelimitedMap };
