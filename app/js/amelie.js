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

/**
 * The two stages before she is a butterfly, used only where Amelie stands in
 * for the day's practice goal (see `setProgress` below). Everywhere else she
 * appears — guiding a listening set, waiting out a speaking timer — she stays
 * the butterfly in `SVG` above: metamorphosis marks the one goal that is
 * actually being built up over the session, not her identity as the guide.
 */
const CATERPILLAR_SVG = `
<svg class="amelie__svg" viewBox="0 0 120 112" role="img" aria-label="Amelie, as a caterpillar">
  <defs>
    <linearGradient id="amelie-cat-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--amelie-light, #f6c977)"/>
      <stop offset="100%" stop-color="var(--amelie-deep, #c47f1d)"/>
    </linearGradient>
  </defs>
  <g class="amelie__caterpillar">
    <path class="amelie__leg" d="M18 96 v8 M30 96 v8 M54 96 v8 M66 96 v8 M90 96 v8"/>
    <ellipse class="amelie__seg" cx="20" cy="84" rx="14" ry="12"/>
    <ellipse class="amelie__seg" cx="44" cy="88" rx="15" ry="13"/>
    <ellipse class="amelie__seg" cx="70" cy="84" rx="15" ry="13"/>
    <ellipse class="amelie__seg amelie__seg--head" cx="94" cy="78" rx="14" ry="13"/>
    <path class="amelie__antenna" d="M100 68 C104 58 106 53 109 47"/>
    <path class="amelie__antenna" d="M92 67 C92 57 90 52 89 46"/>
    <circle class="amelie__antenna-tip" cx="109" cy="46" r="2.6"/>
    <circle class="amelie__antenna-tip" cx="89" cy="45" r="2.6"/>
    <circle class="amelie__eye" cx="99" cy="75" r="2"/>
    <circle class="amelie__spot" cx="20" cy="84" r="4"/>
    <circle class="amelie__spot" cx="44" cy="88" r="4"/>
    <circle class="amelie__spot" cx="70" cy="84" r="4"/>
  </g>
  <g class="amelie__sparkles" aria-hidden="true">
    <path class="amelie__sparkle" d="M104 30 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 Z"/>
    <path class="amelie__sparkle" d="M18 50 l1.4 3.6 3.6 1.4 -3.6 1.4 -1.4 3.6 -1.4 -3.6 -3.6 -1.4 3.6 -1.4 Z"/>
  </g>
</svg>`;

const CHRYSALIS_SVG = `
<svg class="amelie__svg" viewBox="0 0 120 112" role="img" aria-label="Amelie, in a chrysalis">
  <defs>
    <linearGradient id="amelie-chrysalis" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--amelie-light, #f6c977)"/>
      <stop offset="60%" stop-color="var(--amelie, #e8a33d)"/>
      <stop offset="100%" stop-color="var(--accent, #0e6b7d)"/>
    </linearGradient>
  </defs>
  <path class="amelie__thread" d="M60 6 v14"/>
  <path class="amelie__shell"
    d="M60 20 C78 20 88 38 86 58 C84 82 74 100 60 100 C46 100 36 82 34 58 C32 38 42 20 60 20 Z"/>
  <path class="amelie__ridge" d="M42 34 C54 30 66 30 78 34"/>
  <path class="amelie__ridge" d="M38 50 C52 45 68 45 82 50"/>
  <path class="amelie__ridge" d="M37 66 C51 61 69 61 83 66"/>
  <g class="amelie__sparkles" aria-hidden="true">
    <path class="amelie__sparkle" d="M18 40 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z"/>
    <path class="amelie__sparkle" d="M100 50 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 Z"/>
  </g>
</svg>`;

/** Which stage a given amount of daily-goal progress renders as. */
function stageFor(pct, met) {
  if (met) return 'butterfly';
  return pct >= 50 ? 'chrysalis' : 'caterpillar';
}

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
    this.stageName = 'butterfly';
  }

  /**
   * Render her as whatever the day's practice goal has earned so far:
   * caterpillar, then chrysalis at the halfway point, then the butterfly once
   * the goal is met. Opt-in — call this only where Amelie stands for that
   * goal (the Today and Learn meters, and the end-of-session screen). Every
   * other Amelie on screen never calls this and stays the butterfly she
   * always was.
   * @param {number} pct 0-100
   * @param {boolean} met
   */
  setProgress(pct, met) {
    const stage = stageFor(pct, met);
    if (stage === this.stageName) return;
    this.stageName = stage;
    this.figure.innerHTML = stage === 'butterfly' ? SVG : stage === 'chrysalis' ? CHRYSALIS_SVG : CATERPILLAR_SVG;
    this.el.classList.remove('is-stage-caterpillar', 'is-stage-chrysalis', 'is-stage-butterfly');
    this.el.classList.add(`is-stage-${stage}`);
  }

  /**
   * The moment the day's goal is met: she is already drawn as a butterfly by
   * `setProgress`, and this sends her looping across the whole screen rather
   * than just rising in place. A clone, not the live element — the real
   * figure stays put in the layout while the clone flies and removes itself.
   */
  flyAround() {
    const rect = this.figure.getBoundingClientRect();
    const clone = this.figure.cloneNode(true);
    clone.classList.add('amelie__figure--flyaround');
    clone.style.position = 'fixed';
    clone.style.left = `${rect.left}px`;
    clone.style.top = `${rect.top}px`;
    clone.style.width = `${rect.width}px`;
    clone.style.margin = '0';
    document.body.append(clone);
    clone.addEventListener('animationend', () => clone.remove(), { once: true });
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

  /** Celebrate, then settle back to idle. Fires a confetti burst. */
  celebrate(text) {
    this.say(text ?? null, 'celebrating');
    burstConfetti(this.figure);
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
  correct: ['Yes, that one!', 'Correct!', 'Nailed it!', 'Right — keep going!', 'That is it!'],
  wrong: [
    'Not that one. Play it once more and listen to the ending.',
    'Close! Read the transcript, then try the next one.',
    'That was a different word. Tap the transcript to see it written down.',
    'Almost! Listen again — the answer is in the middle of the sentence.',
  ],
  // No fixed line for the end of a listening set. There used to be one —
  // "Great work! Your listening score just moved." — said after every set
  // regardless of the score, so 4 out of 20 was congratulated here and then
  // reported as below the pass mark on the readiness screen. What she says now
  // is chosen from the score by `setVerdict()` in store.js, which is also what
  // the readiness estimate reads, so the two can no longer disagree.
  // Said once, exactly when a session pushes today's cards from short of the
  // goal to met — see the transition check in drill/engine.js. Not reused for
  // "goal already met, opened the app again": that would be the same line for
  // a different, quieter moment, and she would stop meaning it.
  dailyGoalMet: "Today's goal, met — and so is she. Watch her go.",
  learnSetDone: 'Nice work. Those words are booked in for their next review.',
  pairsSetDone: 'Cleared! Every pair you turned over is a word you have met.',
  interviewPrep: 'You have 30 seconds to think. Plan two sentences, not ten.',
  interviewGo: 'Answer out loud, in full sentences. I am recording.',
  interviewDone: 'Recorded. Your partner will score it against the real grid.',
  reviewIntro: 'Score what you actually heard, not what you hoped for. Four criteria, 0 to 5 each.',
  reviewDone: 'Scored. That counts towards your points too — reviewing is practice.',
  imagePick: 'Pick one image and describe it for up to five minutes.',
  offline: 'You are offline. Practice still works; scores will sync when you are back.',
  readiness: 'This is what the examiners would see today.',
};

const CONFETTI_COLORS = ['#e8a33d', '#f0b95e', '#0e6b7d', '#3ba876', '#7c4dbd', '#c1272d'];

function burstConfetti(anchor) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const rect = anchor.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const container = document.createElement('div');
  container.className = 'confetti';
  document.body.append(container);

  for (let i = 0; i < 18; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti__piece';
    const angle = (Math.PI * 2 * i) / 18 + (Math.random() - 0.5) * 0.4;
    const dist = 60 + Math.random() * 80;
    piece.style.setProperty('--cx', `${cx}px`);
    piece.style.setProperty('--cy', `${cy}px`);
    piece.style.setProperty('--ex', `${cx + Math.cos(angle) * dist}px`);
    piece.style.setProperty('--ey', `${cy + Math.sin(angle) * dist - 30}px`);
    piece.style.setProperty('--cr', `${Math.random() * 360}deg`);
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.animationDelay = `${Math.random() * 0.15}s`;
    container.append(piece);
  }

  setTimeout(() => container.remove(), 1200);
}

/** Deterministic-ish pick so she does not repeat herself twice running. */
let lastPick = -1;
export function pickLine(lines) {
  if (!Array.isArray(lines)) return lines;
  let index = Math.floor(Math.random() * lines.length);
  if (index === lastPick) index = (index + 1) % lines.length;
  lastPick = index;
  return lines[index];
}
