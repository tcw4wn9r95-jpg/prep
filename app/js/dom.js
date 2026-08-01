/**
 * The smallest DOM helper that makes the screens readable.
 *
 * There is no framework here on purpose: the app ships as static files to
 * GitHub Pages with no build step, and a bundler would add both a build server
 * and a dependency tree the brief rules out. What the screens actually needed
 * was element construction without `document.createElement` noise, so that is
 * all this is.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'g', 'line', 'polyline', 'text', 'defs', 'linearGradient', 'stop']);

/**
 * @param {string} tag
 * @param {Record<string, any>|null} attrs  null-valued attributes are skipped;
 *   `on*` keys attach listeners; `class`, `style` and `dataset` behave sensibly.
 * @param {...(Node|string|null|undefined|Array)} children
 */
export function el(tag, attrs, ...children) {
  const node = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);

  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'dataset') {
      Object.assign(node.dataset, value);
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(node.style, value);
    } else if (key === 'html') {
      node.innerHTML = value;
    } else if (key === 'hidden') {
      node.hidden = Boolean(value);
    } else {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }

  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Replace a node's children in one go. */
export function fill(node, ...children) {
  node.replaceChildren();
  append(node, children);
  return node;
}

/** `<button class="btn btn--primary">`, shorter. */
export function button(label, { variant = 'primary', ...attrs } = {}) {
  return el('button', { type: 'button', class: `btn btn--${variant}`, ...attrs }, label);
}

/** A back chevron that goes wherever you point it. */
export function backButton(href) {
  return el(
    'a',
    { class: 'iconbtn', href, 'aria-label': 'Back' },
    el(
      'svg',
      { viewBox: '0 0 24 24', width: '24', height: '24', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
      el('path', { d: 'M15 18 L9 12 L15 6' }),
    ),
  );
}

/** A settings gear, for configuration that lives off the main flow. */
export function settingsButton(href, label = 'Settings') {
  const teeth = [0, 45, 90, 135, 180, 225, 270, 315].map((angle) =>
    el('rect', { x: '10.5', y: '1.4', width: '3', height: '5', rx: '1.2', transform: `rotate(${angle} 12 12)` }),
  );
  return el(
    'a',
    { class: 'iconbtn', href, 'aria-label': label },
    el(
      'svg',
      { viewBox: '0 0 24 24', width: '24', height: '24', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
      ...teeth,
      el('circle', { cx: '12', cy: '12', r: '7' }),
      el('circle', { cx: '12', cy: '12', r: '2.4' }),
    ),
  );
}

/** An open book — the cheat sheet icon, shared by the tab bar (main.js) and
 * the in-session button that opens it as a sheet (drill/reference-sheet.js). */
export function bookIcon() {
  return el(
    'svg',
    { viewBox: '0 0 24 24', width: '24', height: '24', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    el('path', { d: 'M4 5.5 C6 4.3 9 4.3 12 5.5 C15 4.3 18 4.3 20 5.5 V18 C18 16.8 15 16.8 12 18 C9 16.8 6 16.8 4 18 Z' }),
    el('path', { d: 'M12 5.5 V18' }),
  );
}

/** Screen header: back button, title, optional subtitle, optional trailing. */
export function screenHead({ title, sub, back, trailing }) {
  return el(
    'header',
    { class: 'screen__head' },
    back ? backButton(back) : null,
    el('div', { class: 'spacer' }, el('h1', { class: 'screen__title' }, title), sub ? el('p', { class: 'screen__sub' }, sub) : null),
    trailing ?? null,
  );
}

export function formatPercent(value) {
  return value === null || value === undefined || Number.isNaN(value) ? '—' : `${Math.round(value)}%`;
}

/** "1 review", "2 reviews" — getting this wrong reads as a bug. */
export function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

/** The Monday a week seed refers to, for a label a human can read. */
export function weekLabel(seed) {
  const monday = new Date(seed * 86400000);
  return monday.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function formatClock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
