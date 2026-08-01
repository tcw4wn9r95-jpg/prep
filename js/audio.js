/**
 * Audio playback for the listening exercises.
 *
 * iOS notes that decide whether this works at all on the target device:
 *  - Only AAC/.m4a is shipped. Safari on iOS cannot decode Ogg Vorbis, and the
 *    failure is silent: `canplay` simply never fires. pipeline/mirror-audio.js
 *    mirrors the AAC variant for exactly this reason.
 *  - Playback must begin inside a user gesture. Every play here is triggered by
 *    a tap, and `unlock()` primes a single reusable element on first touch so
 *    later programmatic plays are allowed.
 */

const AUDIO_BASE = 'assets/audio/';

let unlocked = false;

/**
 * Every live Clip, so other code can ask whether speech is currently playing.
 * chime.js uses it to stay silent over a recording: the B1 half is scored on
 * hearing connected Luxembourgish, and a reward sound mixed on top of a native
 * speaker is the one way this could make someone worse at the exam.
 */
const live = new Set();

export function anyClipPlaying() {
  for (const clip of live) if (clip.isPlaying) return true;
  return false;
}

/** Prime playback inside the first user gesture. Safe to call repeatedly. */
export function unlock() {
  if (unlocked) return;
  const probe = new Audio();
  probe.muted = true;
  // A 1-sample silent wav; enough to satisfy the gesture requirement.
  probe.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
  probe.play().then(
    () => {
      unlocked = true;
    },
    () => {
      /* Ignored: we simply try again on the next gesture. */
    },
  );
}

export function audioUrl(audioId) {
  return `${AUDIO_BASE}${audioId}.m4a`;
}

/**
 * A small controller around one <audio> element.
 * Emits nothing; callers poll `isPlaying` or pass callbacks.
 */
export class Clip {
  constructor(audioId) {
    this.audioId = audioId;
    this.el = new Audio(audioUrl(audioId));
    this.el.preload = 'auto';
    this.plays = 0;
    live.add(this);
  }

  get isPlaying() {
    return !this.el.paused && !this.el.ended;
  }

  async play() {
    unlock();
    try {
      this.el.currentTime = 0;
      await this.el.play();
      this.plays += 1;
      return true;
    } catch {
      // Autoplay refusal or a decode failure — the caller shows the transcript
      // instead of leaving the user stuck with silent audio.
      return false;
    }
  }

  stop() {
    this.el.pause();
    this.el.currentTime = 0;
  }

  on(event, handler) {
    this.el.addEventListener(event, handler);
    return () => this.el.removeEventListener(event, handler);
  }

  destroy() {
    this.stop();
    this.el.src = '';
    live.delete(this);
  }
}

/**
 * The waveform-ish bar strip in the player. Purely decorative, but it gives
 * the tap target somewhere to live and makes playback state legible without
 * relying on colour alone.
 */
export function renderBars(count = 28) {
  const wrap = document.createElement('div');
  wrap.className = 'player__bars';
  wrap.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i += 1) {
    const bar = document.createElement('span');
    bar.className = 'player__bar';
    // A fixed pseudo-random profile so the strip looks like a waveform rather
    // than a bar chart, and stays stable between renders.
    const height = 30 + Math.abs(Math.sin(i * 1.7)) * 70;
    bar.style.height = `${height}%`;
    bar.style.animationDelay = `${(i % 7) * 0.07}s`;
    wrap.append(bar);
  }
  return wrap;
}
