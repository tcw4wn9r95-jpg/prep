'use strict';

/**
 * Read a .docx into plain blocks, with no dependencies.
 *
 * A .docx is a zip of XML. The only part this needs is `word/document.xml`, and
 * of that only the structure a study sheet uses: paragraphs, the runs inside
 * them (for bold), list membership, and tables. Everything else — fonts,
 * colours, styles, comments, the embedded images — is deliberately ignored.
 *
 * This is not a general docx library and does not try to be. It reads the
 * documents it was written for, and says so loudly when it meets one it cannot.
 */

const fs = require('node:fs');
const zlib = require('node:zlib');

/* ------------------------------------------------------------------- zip */

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** The named entry of a zip, inflated. Handles stored and deflated entries. */
function readZipEntry(buffer, wanted) {
  let end = -1;
  for (let at = buffer.length - 22; at >= Math.max(0, buffer.length - 65557); at -= 1) {
    if (buffer.readUInt32LE(at) === EOCD) { end = at; break; }
  }
  if (end < 0) throw new Error('not a zip file (no end-of-central-directory record)');

  const entries = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  for (let i = 0; i < entries; i += 1) {
    if (buffer.readUInt32LE(at) !== CENTRAL) throw new Error('corrupt zip central directory');
    const method = buffer.readUInt16LE(at + 10);
    const compressed = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const localAt = buffer.readUInt32LE(at + 42);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength);

    if (name === wanted) {
      if (buffer.readUInt32LE(localAt) !== LOCAL) throw new Error('corrupt zip local header');
      const dataAt = localAt + 30 + buffer.readUInt16LE(localAt + 26) + buffer.readUInt16LE(localAt + 28);
      const raw = buffer.subarray(dataAt, dataAt + compressed);
      if (method === 0) return raw;
      if (method === 8) return zlib.inflateRawSync(raw);
      throw new Error(`zip entry ${name} uses compression method ${method}`);
    }
    at += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`${wanted} is not in this file — is it really a .docx?`);
}

/* ------------------------------------------------------------------- xml */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const decode = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });

/** A tolerant little tree: { tag, attrs, children[], text } — enough for WordprocessingML. */
function parseXml(xml) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const token = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>|<[?!][^>]*>|([^<]+)/g;
  let match;
  while ((match = token.exec(xml)) !== null) {
    const [, closing, tag, attrText, selfClosing, text] = match;
    if (text !== undefined) {
      stack[stack.length - 1].children.push({ tag: '#text', text: decode(text) });
    } else if (tag) {
      if (closing) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const attrs = {};
      for (const pair of attrText.matchAll(/([\w:.-]+)="([^"]*)"/g)) attrs[pair[1]] = decode(pair[2]);
      const node = { tag, attrs, children: [] };
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) stack.push(node);
    }
  }
  return root;
}

const kids = (node, tag) => (node?.children ?? []).filter((child) => child.tag === tag);
const first = (node, tag) => kids(node, tag)[0] ?? null;

/* ----------------------------------------------------------------- blocks */

/** The text of one run, with tabs and breaks kept as whitespace. */
function runText(run) {
  let out = '';
  for (const child of run.children) {
    if (child.tag === 'w:t') out += child.children.map((node) => node.text ?? '').join('');
    else if (child.tag === 'w:tab') out += '\t';
    else if (child.tag === 'w:br' || child.tag === 'w:cr') out += '\n';
  }
  return out;
}

/** True when the run is set bold and not switched off again. */
function isBold(run) {
  const props = first(run, 'w:rPr');
  const bold = props ? first(props, 'w:b') : null;
  if (!bold) return false;
  const value = bold.attrs['w:val'];
  return value === undefined || !['0', 'false', 'off'].includes(String(value).toLowerCase());
}

/**
 * One paragraph.
 *
 * `bold` is true only when *every* run that carries text is bold — a heading,
 * not a sentence with one emphasised word. `emphasis` keeps the bold spans, so
 * a caller that needs "the question is the bold part" can have it.
 */
function paragraph(node) {
  const props = first(node, 'w:pPr');
  const numbering = props ? first(props, 'w:numPr') : null;
  const style = props ? first(props, 'w:pStyle')?.attrs['w:val'] ?? null : null;

  const spans = [];
  const collect = (parent) => {
    for (const child of parent.children) {
      if (child.tag === 'w:r') {
        const text = runText(child);
        if (text) spans.push({ text, bold: isBold(child) });
      } else if (child.tag === 'w:hyperlink' || child.tag === 'w:ins' || child.tag === 'w:smartTag') {
        collect(child);
      }
    }
  };
  collect(node);

  const text = spans.map((span) => span.text).join('');
  const visible = spans.filter((span) => span.text.trim() !== '');
  return {
    kind: 'p',
    text,
    style,
    listed: Boolean(numbering),
    bold: visible.length > 0 && visible.every((span) => span.bold),
    emphasis: spans.filter((span) => span.bold && span.text.trim() !== '').map((span) => span.text),
  };
}

function table(node) {
  const rows = [];
  for (const row of kids(node, 'w:tr')) {
    rows.push(kids(row, 'w:tc').map((cell) => kids(cell, 'w:p').map((p) => paragraph(p).text)));
  }
  return { kind: 'table', rows };
}

/** The document as a flat list of paragraph and table blocks, in order. */
function readDocx(file) {
  const buffer = Buffer.isBuffer(file) ? file : fs.readFileSync(file);
  const xml = readZipEntry(buffer, 'word/document.xml').toString('utf8');
  const body = first(first(parseXml(xml), 'w:document'), 'w:body');
  if (!body) throw new Error('no <w:body> in word/document.xml');

  const blocks = [];
  for (const child of body.children) {
    if (child.tag === 'w:p') blocks.push(paragraph(child));
    else if (child.tag === 'w:tbl') blocks.push(table(child));
  }
  return blocks;
}

module.exports = { readDocx, readZipEntry, parseXml };
