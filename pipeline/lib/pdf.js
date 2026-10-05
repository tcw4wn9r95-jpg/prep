'use strict';

/**
 * Read the text of a PDF, with no dependencies.
 *
 * Built for one kind of file: a word-processor export (LibreOffice, Word) of a
 * study sheet — Flate-compressed content streams, fonts with a ToUnicode map,
 * lines positioned one at a time. It is not a PDF library. Anything outside that
 * — object streams, encryption, a font with no ToUnicode map, a filter other
 * than Flate — stops with a message that says so, because the alternative is text
 * that is *almost* right, and a wrong letter in an exam answer is worse than no
 * answer.
 *
 * The output is lines in reading order, which is all the notes build needs. It
 * was checked against pypdf on the file it was written for: the same text, page
 * by page, once whitespace is collapsed.
 */

const fs = require('node:fs');
const zlib = require('node:zlib');

/* --------------------------------------------------------------- objects */

/** A small PDF object parser: dictionaries, arrays, names, numbers, references, strings. */
function parseValue(text, at = 0) {
  const skip = () => {
    while (at < text.length && /[\s]/.test(text[at])) at += 1;
  };
  skip();

  if (text.startsWith('<<', at)) {
    at += 2;
    const dict = {};
    for (;;) {
      skip();
      if (text.startsWith('>>', at)) { at += 2; break; }
      if (text[at] !== '/') throw new Error(`bad dictionary at ${at}: ${text.slice(at, at + 20)}`);
      const [key, afterKey] = parseName(text, at);
      const [value, afterValue] = parseValue(text, afterKey);
      dict[key] = value;
      at = afterValue;
    }
    return [dict, at];
  }
  if (text[at] === '[') {
    at += 1;
    const list = [];
    for (;;) {
      skip();
      if (text[at] === ']') { at += 1; break; }
      const [value, next] = parseValue(text, at);
      list.push(value);
      at = next;
    }
    return [list, at];
  }
  if (text[at] === '/') return parseName(text, at);
  if (text[at] === '(') return parseLiteral(text, at);
  if (text[at] === '<') {
    const end = text.indexOf('>', at);
    return [{ hex: text.slice(at + 1, end).replace(/\s/g, '') }, end + 1];
  }

  const ref = /^(\d+)\s+(\d+)\s+R(?![\w])/.exec(text.slice(at, at + 40));
  if (ref) return [{ ref: Number(ref[1]) }, at + ref[0].length];

  const word = /^[^\s/<>[\]()]+/.exec(text.slice(at, at + 60));
  if (!word) throw new Error(`cannot parse a value at ${at}: ${text.slice(at, at + 20)}`);
  const raw = word[0];
  const value = /^[+-]?\d*\.?\d+$/.test(raw) ? Number(raw) : raw;
  return [value, at + raw.length];
}

function parseName(text, at) {
  const match = /^\/([^\s/<>[\]()]*)/.exec(text.slice(at, at + 200));
  return [match[1].replace(/#([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))), at + match[0].length];
}

/** A literal string `(…)`, with nesting and escapes, as latin1 characters. */
function parseLiteral(text, at) {
  let depth = 0;
  let out = '';
  for (let i = at; i < text.length; i += 1) {
    const char = text[i];
    if (char === '\\') {
      const next = text[i + 1];
      const octal = /^[0-7]{1,3}/.exec(text.slice(i + 1, i + 4));
      if (octal) { out += String.fromCharCode(parseInt(octal[0], 8)); i += octal[0].length; continue; }
      const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
      if (next === '\n') { i += 1; continue; }
      out += map[next] ?? next;
      i += 1;
    } else if (char === '(') {
      depth += 1;
      if (depth > 1) out += char;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) return [{ bytes: out }, i + 1];
      out += char;
    } else {
      out += char;
    }
  }
  throw new Error('unterminated string');
}

/** Every `N 0 obj … endobj`, with the decoded stream where there is one. */
function readObjects(buffer) {
  const latin = buffer.toString('latin1');
  const objects = new Map();
  const head = /(\d+)\s+(\d+)\s+obj\b/g;
  let match;
  while ((match = head.exec(latin)) !== null) {
    const number = Number(match[1]);
    const bodyStart = match.index + match[0].length;
    const end = latin.indexOf('endobj', bodyStart);
    if (end < 0) continue;
    const body = latin.slice(bodyStart, end);
    const streamAt = body.search(/\bstream\r?\n/);

    const dictText = streamAt >= 0 ? body.slice(0, streamAt) : body;
    let value = null;
    try {
      [value] = parseValue(dictText.trim());
    } catch {
      value = null;
    }

    let stream = null;
    if (streamAt >= 0) {
      const dataStart = bodyStart + body.indexOf('\n', streamAt) + 1;
      const dataEnd = latin.lastIndexOf('endstream', end);
      let data = buffer.subarray(dataStart, dataEnd);
      // The EOL before `endstream` is not part of the data.
      if (data[data.length - 1] === 0x0a) data = data.subarray(0, data.length - 1);
      if (data[data.length - 1] === 0x0d) data = data.subarray(0, data.length - 1);

      const filter = value?.Filter;
      const filters = Array.isArray(filter) ? filter : filter ? [filter] : [];
      if (filters.length > 1 || (filters.length === 1 && filters[0] !== 'FlateDecode')) {
        throw new Error(`object ${number} uses the filter ${filters.join('+')}; only FlateDecode is supported`);
      }
      stream = filters.length === 1 ? zlib.inflateSync(data) : data;
      if (value?.Type === 'ObjStm') throw new Error('this PDF uses object streams, which are not supported');
    }
    objects.set(number, { value, stream });
  }
  return objects;
}

/* ----------------------------------------------------------------- fonts */

/** A ToUnicode CMap as { codeLength, map: Map(code → string) }. */
function parseCMap(text) {
  const map = new Map();
  let codeLength = 1;
  const space = /begincodespacerange\s*<([0-9a-fA-F]+)>/.exec(text);
  if (space) codeLength = space[1].length / 2;

  const utf16 = (hex) => {
    let out = '';
    for (let i = 0; i < hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    return out;
  };

  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) map.set(parseInt(pair[1], 16), utf16(pair[2]));
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const row of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]+>|\[[^\]]*\])/g)) {
      const low = parseInt(row[1], 16);
      const high = parseInt(row[2], 16);
      if (row[3].startsWith('[')) {
        [...row[3].matchAll(/<([0-9a-fA-F]+)>/g)].forEach((one, at) => map.set(low + at, utf16(one[1])));
      } else {
        const start = row[3].slice(1, -1);
        const base = parseInt(start.slice(-4), 16);
        for (let code = low; code <= high; code += 1) map.set(code, utf16(start.slice(0, -4)) + String.fromCharCode(base + code - low));
      }
    }
  }
  return { codeLength, map };
}

/* --------------------------------------------------------------- content */

/** Tokens of a content stream: numbers, names, strings, arrays and operators. */
function* tokens(text) {
  let at = 0;
  while (at < text.length) {
    const char = text[at];
    if (/\s/.test(char)) { at += 1; continue; }
    if (char === '%') { at = text.indexOf('\n', at); if (at < 0) return; continue; }
    if (char === '[') {
      const [value, next] = parseValue(text, at);
      yield { array: value };
      at = next;
    } else if (char === '(') {
      const [value, next] = parseLiteral(text, at);
      yield { string: value.bytes };
      at = next;
    } else if (char === '<' && text[at + 1] !== '<') {
      const end = text.indexOf('>', at);
      yield { hex: text.slice(at + 1, end).replace(/\s/g, '') };
      at = end + 1;
    } else if (char === '/') {
      const [name, next] = parseName(text, at);
      yield { name };
      at = next;
    } else {
      const word = /^[^\s/<>[\]()%]+/.exec(text.slice(at, at + 40));
      if (!word) { at += 1; continue; }
      const raw = word[0];
      yield /^[+-]?\d*\.?\d+$/.test(raw) ? { number: Number(raw) } : { op: raw };
      at += raw.length;
    }
  }
}

const bytesOf = (value) => {
  // A string in a content stream is `{ string }`; the same string inside a TJ
  // array went through the object parser, which calls it `{ bytes }`.
  if (value.bytes !== undefined) return Buffer.from(value.bytes, 'latin1');
  if (value.string !== undefined) return Buffer.from(value.string, 'latin1');
  return Buffer.from(value.hex.length % 2 ? `${value.hex}0` : value.hex, 'hex');
};

/** The text chunks of one page, each with where it was drawn. */
function chunksOf(content, fonts) {
  const chunks = [];
  let font = null;
  let size = 12;
  let line = [1, 0, 0, 1, 0, 0]; // the line matrix
  let leading = 0;
  const stack = [];

  /** Decode one string; returns { text, width } in points at the current size. */
  const decode = (value) => {
    if (!font) return { text: '', width: 0 };
    const raw = bytesOf(value);
    let text = '';
    let width = 0;
    for (let i = 0; i < raw.length; i += font.codeLength) {
      let code = 0;
      for (let j = 0; j < font.codeLength; j += 1) code = code * 256 + raw[i + j];
      text += font.map.get(code) ?? '';
      const glyph = font.widths?.[code - font.first];
      width += ((typeof glyph === 'number' ? glyph : 500) / 1000) * size;
    }
    return { text, width };
  };

  const show = (value, x, y) => {
    const { text, width } = decode(value);
    if (text) chunks.push({ x, y, text, end: x + width, size });
  };

  const operands = [];
  for (const token of tokens(content)) {
    if (token.op === undefined) { operands.push(token); continue; }
    const n = (at) => operands[at]?.number ?? 0;
    switch (token.op) {
      case 'BT': line = [1, 0, 0, 1, 0, 0]; break;
      case 'Tf': font = fonts.get(operands[0]?.name) ?? null; size = n(1); break;
      case 'Tm': line = [n(0), n(1), n(2), n(3), n(4), n(5)]; break;
      case 'Td': line = [line[0], line[1], line[2], line[3], line[4] + n(0), line[5] + n(1)]; break;
      case 'TD': leading = -n(1); line = [line[0], line[1], line[2], line[3], line[4] + n(0), line[5] + n(1)]; break;
      case 'TL': leading = n(0); break;
      case 'T*': line = [line[0], line[1], line[2], line[3], line[4], line[5] - leading]; break;
      case 'Tj': show(operands[0], line[4], line[5]); break;
      case "'": line = [line[0], line[1], line[2], line[3], line[4], line[5] - leading]; show(operands[0], line[4], line[5]); break;
      case 'TJ': {
        // One run, with a word space where the kerning gap is wide enough to be
        // one — some exporters draw a space that way — and the width it covers.
        let run = '';
        let width = 0;
        for (const part of operands[0]?.array ?? []) {
          if (typeof part === 'number') {
            width -= (part / 1000) * size;
            if (part < -250) run += ' ';
          } else {
            const piece = decode(part);
            run += piece.text;
            width += piece.width;
          }
        }
        if (run) chunks.push({ x: line[4], y: line[5], text: run, end: line[4] + width, size });
        break;
      }
      case 'q': stack.push([line.slice(), size]); break;
      case 'Q': [line, size] = stack.pop() ?? [line, size]; break;
      default: break;
    }
    operands.length = 0;
  }
  return chunks;
}

/* -------------------------------------------------------------- the file */

const resolve = (objects, value) => (value && typeof value === 'object' && 'ref' in value ? objects.get(value.ref)?.value : value);

/** The pages of the document, in order, as lists of lines. */
function readPdf(file) {
  const buffer = Buffer.isBuffer(file) ? file : fs.readFileSync(file);
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('not a PDF file');
  const objects = readObjects(buffer);

  const catalog = [...objects.values()].find((object) => object.value?.Type === 'Catalog');
  if (!catalog) throw new Error('no catalog in this PDF');

  const pages = [];
  const walk = (node) => {
    const value = resolve(objects, node);
    if (!value) return;
    if (value.Type === 'Pages') for (const kid of value.Kids ?? []) walk(kid);
    else if (value.Type === 'Page') pages.push(value);
  };
  walk(catalog.value.Pages);

  const fontCache = new Map();
  const fontFor = (ref) => {
    if (fontCache.has(ref.ref)) return fontCache.get(ref.ref);
    const dict = objects.get(ref.ref)?.value;
    const unicode = dict?.ToUnicode;
    if (!unicode) throw new Error(`font ${dict?.BaseFont ?? ref.ref} has no ToUnicode map, so its text cannot be read reliably`);
    const parsed = parseCMap(objects.get(unicode.ref).stream.toString('latin1'));
    // Glyph widths, in thousandths of an em, so a run knows where it ends and a
    // gap between two runs on a line can be told from a split inside a word.
    const widths = resolve(objects, dict.Widths);
    parsed.widths = Array.isArray(widths) ? widths : null;
    parsed.first = dict.FirstChar ?? 0;
    fontCache.set(ref.ref, parsed);
    return parsed;
  };

  return pages.map((page) => {
    const resources = resolve(objects, page.Resources) ?? {};
    const fontDict = resolve(objects, resources.Font) ?? {};
    const fonts = new Map(Object.entries(fontDict).map(([name, ref]) => [name, fontFor(ref)]));

    const parts = Array.isArray(page.Contents) ? page.Contents : [page.Contents];
    const content = parts.map((ref) => objects.get(ref.ref)?.stream?.toString('latin1') ?? '').join('\n');
    const chunks = chunksOf(content, fonts);

    // Reading order: top to bottom, then left to right. Chunks within two
    // points of each other vertically are one line.
    chunks.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const chunk of chunks) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - chunk.y) <= 2) last.chunks.push(chunk);
      else lines.push({ y: chunk.y, chunks: [chunk] });
    }
    return lines
      .map((line) => {
        const ordered = line.chunks.sort((a, b) => a.x - b.x);
        let text = '';
        ordered.forEach((chunk, at) => {
          const before = ordered[at - 1];
          // A list marker or a tab stop leaves a gap the width of a space or
          // more; a run split mid-word by a style change leaves none.
          if (before && chunk.x - before.end > chunk.size * 0.2 && !/\s$/.test(text) && !/^\s/.test(chunk.text)) text += ' ';
          text += chunk.text;
        });
        return text;
      })
      .filter((text) => text.trim() !== '');
  });
}

module.exports = { readPdf, parseCMap, parseValue };
