/**
 * Amelie — the butterfly who guides you through the exam.
 *
 * She is one inline SVG plus a speech bubble. Everything about her is CSS, so
 * she costs no network, works offline, and honours `prefers-reduced-motion`
 * without any JavaScript branching.
 *
 * Why a butterfly, and not a mascot with a hat: the exam is the last step of
 * naturalisation, so metamorphosis is the honest metaphor rather than a
 * decorative one. She is drawn in the app's own amber — reserved for her alone
 * — so warm colour anywhere on screen means Amelie is speaking.
 *
 * Her copy rule, from the brief: English, sentence case, active voice. When
 * you get something wrong she says what to do next, never how disappointing
 * it was.
 */

/** The states she can be in. Each maps to a CSS class on the root element. */
export const AMELIE_STATES = ['idle', 'flying', 'listening', 'thinking', 'celebrating', 'encouraging'];

const SVG = `
<svg class="amelie__svg" viewBox="0 0 120 112" role="img" aria-label="Amelie, your guide">
  <defs>
    <linearGradient id="amelie-wing-upper" x1="0.15" y1="0" x2="0.9" y2="1">
      <stop offset="0%" stop-color="var(--amelie-light, #f6c977)"/>
      <stop offset="55%" stop-color="var(--amelie, #e8a33d)"/>
      <stop offset="100%" stop-color="var(--amelie-deep, #c47f1d)"/>
    </linearGradient>
    <linearGradient id="amelie-wing-lower" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0%" stop-color="var(--amelie, #e8a33d)"/>
      <stop offset="100%" stop-color="var(--accent, #0e6b7d)"/>
    </linearGradient>
  </defs>

  <g class="amelie__wing amelie__wing--left">
    <path class="amelie__wing-upper"
      d="M60 54 C46 20 24 6 10 14 C2 30 12 52 32 60 C46 64 56 62 60 54 Z"/>
    <path class="amelie__wing-lower"
      d="M60 57 C48 63 34 71 32 85 C31 97 42 103 50 97 C57 91 60 75 60 57 Z"/>
    <circle class="amelie__spot" cx="26" cy="33" r="5"/>
    <circle class="amelie__spot amelie__spot--sm" cx="42" cy="84" r="3"/>
  </g>

  <g class="amelie__wing amelie__wing--right">
    <path class="amelie__wing-upper"
      d="M60 54 C74 20 96 6 110 14 C118 30 108 52 88 60 C74 64 64 62 60 54 Z"/>
    <path class="amelie__wing-lower"
      d="M60 57 C72 63 86 71 88 85 C89 97 78 103 70 97 C63 91 60 75 60 57 Z"/>
    <circle class="amelie__spot" cx="94" cy="33" r="5"/>
    <circle class="amelie__spot amelie__spot--sm" cx="78" cy="84" r="3"/>
  </g>

  <g class="amelie__body">
    <path class="amelie__antenna" d="M57 27 C50 16 44 11 38 9"/>
    <path class="amelie__antenna" d="M63 27 C70 16 76 11 82 9"/>
    <circle class="amelie__antenna-tip" cx="37" cy="8" r="2.6"/>
    <circle class="amelie__antenna-tip" cx="83" cy="8" r="2.6"/>
    <rect class="amelie__thorax" x="55" y="26" width="10" height="62" rx="5"/>
    <circle class="amelie__head" cx="60" cy="27" r="8.5"/>
    <circle class="amelie__eye" cx="56.6" cy="26" r="1.7"/>
    <circle class="amelie__eye" cx="63.4" cy="26" r="1.7"/>
  </g>

  <g class="amelie__sparkles" aria-hidden="true">
    <path class="amelie__sparkle" d="M18 18 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z"/>
    <path class="amelie__sparkle" d="M100 24 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 Z"/>
    <path class="amelie__sparkle" d="M60 4 l1.4 3.6 3.6 1.4 -3.6 1.4 -1.4 3.6 -1.4 -3.6 -3.6 -1.4 3.6 -1.4 Z"/>
  </g>
</svg>`;

export class Amelie {
  /**
   * @param {object} [options]
   * @param {'sm'|'md'|'lg'} [options.size]
   * @param {boolean} [options.bubble] render a speech bubble alongside her
   */
  constructor({ size = 'md', bubble = true } = {}) {
    this.el = document.createElement('div');
    this.el.className = `amelie amelie--${size} is-idle`;

    this.figure = document.createElement('div');
    this.figure.className = 'amelie__figure';
    this.figure.innerHTML = SVG;

    this.el.append(this.figure);

    if (bubble) {
      this.bubble = document.createElement('p');
      // aria-live so her guidance reaches a screen reader when it changes,
      // without stealing focus mid-exercise.
      this.bubble.className = 'amelie__bubble';
      this.bubble.setAttribute('aria-live', 'polite');
      this.bubble.hidden = true;
      this.el.append(this.bubble);
    }

    this.state = 'idle';
  }

  /** @param {typeof AMELIE_STATES[number]} state */
  setState(state) {
    if (!AMELIE_STATES.includes(state)) throw new Error(`unknown Amelie state: ${state}`);
    for (const known of AMELIE_STATES) this.el.classList.remove(`is-${known}`);
    this.el.classList.add(`is-${state}`);
    this.state = state;
  }

  /**
   * Say something. Passing null clears the bubble.
   * @param {string|null} text
   * @param {typeof AMELIE_STATES[number]} [state]
   */
  say(text, state) {
    if (state) this.setState(state);
    if (!this.bubble) return;
    if (!text) {
      this.bubble.hidden = true;
      this.bubble.textContent = '';
      return;
    }
    this.bubble.hidden = false;
    this.bubble.textContent = text;
    // Restart the entrance animation on every new line.
    this.bubble.classList.remove('is-new');
    void this.bubble.offsetWidth;
    this.bubble.classList.add('is-new');
  }

  /** Celebrate, then settle back to idle. */
  celebrate(text) {
    this.say(text ?? null, 'celebrating');
    window.clearTimeout(this._settle);
    this._settle = window.setTimeout(() => this.setState('idle'), 2200);
  }
}

/**
 * Amelie's lines, kept together so the voice stays consistent.
 * Sentence case, active voice, no filler, no guilt.
 */
export const AMELIE_LINES = {
  welcome: 'Moien. I am Amelie. I will walk you through the exam, one topic at a time.',
  pickPlayer: 'Who is practising today?',
  journey: 'Pick a topic. Listening builds your B1, speaking builds your A2.',
  listeningStart: 'Listen once, answer, then listen again to check. The transcript is there when you want it.',
  correct: ['Yes, that one.', 'Correct.', 'That is it.', 'Right — next.'],
  wrong: [
    'Not that one. Play it once more and listen to the ending.',
    'Close. Read the transcript, then try the next one.',
    'That was a different word. Tap the transcript to see it written down.',
  ],
  setDone: 'Set finished. Your listening score just moved.',
  interviewPrep: 'You have 30 seconds to think. Plan two sentences, not ten.',
  interviewGo: 'Answer out loud, in full sentences. I am recording.',
  interviewDone: 'Recorded. Your partner will score it against the real grid.',
  reviewIntro: 'Score what you actually heard, not what you hoped for. Four criteria, 0 to 5 each.',
  reviewDone: 'Scored. That counts towards your points too — reviewing is practice.',
  imagePick: 'Pick one image and describe it for up to five minutes.',
  offline: 'You are offline. Practice still works; scores will sync when you are back.',
  readiness: 'This is what the examiners would see today.',
};

/** Deterministic-ish pick so she does not repeat herself twice running. */
let lastPick = -1;
export function pickLine(lines) {
  if (!Array.isArray(lines)) return lines;
  let index = Math.floor(Math.random() * lines.length);
  if (index === lastPick) index = (index + 1) % lines.length;
  lastPick = index;
  return lines[index];
}
