'use strict';

/**
 * Minimal streaming XML pull-parser for the LOD bulk exports.
 *
 * Why hand-rolled instead of a dependency: the three LOD files are 16-100 MB,
 * so they have to be streamed, and they come from a single machine producer
 * that emits a strict subset of XML - no namespaces, no CDATA, no DTD, no
 * processing instructions past the declaration, no mixed content that matters
 * to us. Anything outside that subset is a signal that the export format
 * changed, so this parser throws instead of guessing. See `npm run selftest`.
 */

const fs = require('node:fs');

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(raw) {
  if (raw.indexOf('&') === -1) return raw;
  return raw.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
    if (body[0] === '#') {
      const codePoint =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      if (!Number.isFinite(codePoint)) throw new Error(`bad numeric entity ${match}`);
      return String.fromCodePoint(codePoint);
    }
    const named = NAMED_ENTITIES[body];
    if (named === undefined) throw new Error(`unknown XML entity ${match}`);
    return named;
  });
}

const ATTR_RE = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*"([^"]*)"/g;

function parseAttributes(source) {
  const attrs = {};
  ATTR_RE.lastIndex = 0;
  let match;
  let consumed = 0;
  while ((match = ATTR_RE.exec(source)) !== null) {
    attrs[match[1]] = decodeEntities(match[2]);
    consumed = ATTR_RE.lastIndex;
  }
  if (source.slice(consumed).trim() !== '') {
    throw new Error(`unparsable attributes: ${source.trim().slice(0, 120)}`);
  }
  return attrs;
}

/**
 * Yields `{ type: 'open' | 'close' | 'text', name?, attrs?, value? }`.
 * Whitespace-only text between elements is dropped - the LOD exports are
 * pretty-printed, so indentation is never significant.
 */
async function* parse(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 1 << 20 });
  let buffer = '';
  let sawRoot = false;

  const drain = function* (final) {
    for (;;) {
      const lt = buffer.indexOf('<');
      if (lt === -1) {
        if (final && buffer.trim() !== '') throw new Error('trailing text outside any element');
        if (!final) return;
        buffer = '';
        return;
      }
      if (lt > 0) {
        const text = buffer.slice(0, lt);
        if (text.trim() !== '') yield { type: 'text', value: decodeEntities(text) };
        buffer = buffer.slice(lt);
        continue;
      }
      const gt = buffer.indexOf('>');
      if (gt === -1) {
        if (final) throw new Error('unterminated tag at end of document');
        return;
      }
      const tag = buffer.slice(1, gt);
      buffer = buffer.slice(gt + 1);

      if (tag.startsWith('?')) {
        if (sawRoot) throw new Error('unsupported processing instruction inside document');
        continue; // the <?xml ...?> declaration
      }
      if (tag.startsWith('!')) {
        // Comments, CDATA and DOCTYPE are all absent from the LOD exports.
        throw new Error(`unsupported markup declaration <${tag.slice(0, 40)}>`);
      }
      if (tag.startsWith('/')) {
        yield { type: 'close', name: tag.slice(1).trim() };
        continue;
      }

      const selfClosing = tag.endsWith('/');
      const body = selfClosing ? tag.slice(0, -1) : tag;
      const space = body.search(/\s/);
      const name = space === -1 ? body : body.slice(0, space);
      if (name === '' || /[<>]/.test(name)) throw new Error(`bad element name in <${tag.slice(0, 40)}>`);
      const attrs = space === -1 ? {} : parseAttributes(body.slice(space));
      sawRoot = true;
      yield { type: 'open', name, attrs };
      if (selfClosing) yield { type: 'close', name };
    }
  };

  for await (const chunk of stream) {
    buffer += chunk;
    // A tag can straddle a chunk boundary; keep the tail until it is complete.
    yield* drain(false);
  }
  yield* drain(true);
}

/**
 * Streams the direct children of the document root that match `elementName`,
 * materialising each as a small plain-object tree:
 *   { name, attrs, text, children: [...] }
 * Only one record is in memory at a time, which is what makes 100 MB inputs
 * cheap. Text is concatenated per node with single spaces.
 */
async function* records(filePath, elementName) {
  let root = null;
  const stack = [];
  for await (const event of parse(filePath)) {
    if (event.type === 'open') {
      const node = { name: event.name, attrs: event.attrs, text: '', children: [] };
      if (stack.length > 0) stack[stack.length - 1].children.push(node);
      else if (root === null && event.name !== elementName) {
        // document root wrapper (<lod>, <entries>, <tables>)
        root = event.name;
        continue;
      }
      stack.push(node);
    } else if (event.type === 'text') {
      if (stack.length > 0) {
        const node = stack[stack.length - 1];
        node.text = node.text === '' ? event.value : `${node.text} ${event.value}`;
      }
    } else {
      if (stack.length === 0) {
        if (event.name === root) continue;
        throw new Error(`unbalanced </${event.name}>`);
      }
      const node = stack.pop();
      if (node.name !== event.name) {
        throw new Error(`mismatched close: <${node.name}> closed by </${event.name}>`);
      }
      if (stack.length === 0 && node.name === elementName) yield node;
    }
  }
  if (stack.length > 0) throw new Error(`unclosed <${stack[stack.length - 1].name}>`);
}

/** First descendant with the given tag name, depth-first. */
function find(node, name) {
  for (const child of node.children) {
    if (child.name === name) return child;
    const nested = find(child, name);
    if (nested) return nested;
  }
  return null;
}

/** All descendants with the given tag name, in document order. */
function findAll(node, name, out = []) {
  for (const child of node.children) {
    if (child.name === name) out.push(child);
    findAll(child, name, out);
  }
  return out;
}

/** Direct children with the given tag name. */
function childrenNamed(node, name) {
  return node.children.filter((child) => child.name === name);
}

module.exports = { parse, records, find, findAll, childrenNamed, decodeEntities };
