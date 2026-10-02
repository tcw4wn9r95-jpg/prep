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

/* ------------------------------------------------------------- scrubbing */

/** `3:07`. Hours are not a case here: the longest episode is twelve minutes. */
export function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * A position inside the recording.
 *
 * Clamped at both ends, and left alone when nothing knows how long the file is
 * — seeking past the end of a stream makes some browsers reload it from zero,
 * which is the one failure a seek bar must not have.
 */
export function clampTime(seconds, duration) {
  const at = Number.isFinite(seconds) ? Math.max(seconds, 0) : 0;
  if (!Number.isFinite(duration) || duration <= 0) return at;
  return Math.min(at, duration);
}

/** How far along, 0–1, for drawing the filled part of the bar. */
export function progressOf(at, duration) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(Math.max(at / duration, 0), 1);
}

/** How long a skip button jumps. Fifteen seconds is the podcast convention. */
export const SKIP_SECONDS = 15;

/**
 * A seek bar for long audio: drag it, tap a point on it, or jump by fifteen
 * seconds either way.
 *
 * Asked for as "a way to scroll across the audio to avoid having to listen to
 * everything", which a Play button alone cannot do — an episode runs five
 * minutes on average and the answer to a question may be at four.
 *
 * It is a native `<input type="range">` rather than a div with pointer
 * handlers, which costs some CSS and buys drag, tap-to-position, arrow keys,
 * VoiceOver and every other platform behaviour for nothing.
 *
 * The position is only *written* back to the element on release. Seeking on
 * every pixel of a drag restarts the network read on a streamed file over and
 * over; the label follows the thumb all the way so it still feels live.
 */
export function renderScrubber(clip, { label = 'Position in the recording' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'scrub';

  const range = document.createElement('input');
  range.type = 'range';
  range.className = 'scrub__range';
  range.min = '0';
  range.step = '1';
  range.value = '0';
  range.max = '1';
  range.setAttribute('aria-label', label);

  const at = document.createElement('span');
  const end = document.createElement('span');
  const times = document.createElement('div');
  times.className = 'scrub__times';
  times.append(at, end);

  const skip = (seconds, text, aria) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'chip chip--action scrub__skip';
    node.textContent = text;
    node.setAttribute('aria-label', aria);
    node.addEventListener('click', () => {
      scrubbing = false;
      paint(clip.seek(clip.position + seconds));
    });
    return node;
  };

  const jumps = document.createElement('div');
  jumps.className = 'scrub__jumps';
  jumps.append(skip(-SKIP_SECONDS, `−${SKIP_SECONDS}s`, `Back ${SKIP_SECONDS} seconds`), skip(SKIP_SECONDS, `+${SKIP_SECONDS}s`, `Forward ${SKIP_SECONDS} seconds`));

  /** True between the first drag event and letting go, when the thumb leads. */
  let scrubbing = false;

  function paint(position = clip.position) {
    const total = clip.duration;
    range.max = String(Math.max(Math.round(total), 1));
    range.disabled = total <= 0;
    if (!scrubbing) range.value = String(Math.round(clampTime(position, total)));
    at.textContent = formatClock(position);
    end.textContent = total > 0 ? formatClock(total) : '--:--';
    // CSS paints the played part from this: Safari has no ::-moz-range-progress
    // and no way to style the left half of a range otherwise.
    range.style.setProperty('--at', `${progressOf(position, total) * 100}%`);
  }

  range.addEventListener('input', () => {
    scrubbing = true;
    paint(Number(range.value));
  });
  range.addEventListener('change', () => {
    const target = clip.seek(Number(range.value));
    scrubbing = false;
    paint(target);
  });

  const offs = [
    clip.on('timeupdate', () => paint()),
    clip.on('loadedmetadata', () => paint()),
    clip.on('durationchange', () => paint()),
    clip.on('seeked', () => paint()),
  ];

  paint(0);
  wrap.append(range, times, jumps);
  return {
    el: wrap,
    paint,
    destroy() {
      for (const off of offs) off();
    },
  };
}

/**
 * A small controller around one <audio> element.
 * Emits nothing; callers poll `isPlaying` or pass callbacks.
 */
export class Clip {
  /**
   * @param {string} source a mirrored LOD audio id, or an absolute URL.
   * @param {{duration?: number}} [options] how long the recording is, when
   *   something already knows. The podcast feed publishes a duration for every
   *   episode, and `preload` is `none` for a streamed one — so without this the
   *   seek bar would have no scale to draw until the first tap on Play.
   *
   * The URL form is for the INLL podcast, which is streamed from the publisher
   * rather than mirrored — there is no local file to name. A media element
   * plays cross-origin without CORS, so this needs no other special handling,
   * and the service worker leaves cross-origin requests alone, which is how
   * "stream, never store" ends up being the default rather than a rule to
   * enforce.
   */
  constructor(source, { duration = 0 } = {}) {
    this.remote = /^https?:/i.test(source);
    this.audioId = this.remote ? null : source;
    this.el = new Audio(this.remote ? source : audioUrl(source));
    this.el.preload = this.remote ? 'none' : 'auto';
    this.plays = 0;
    this.declaredDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
    /** A seek asked for before the browser knew the file — see `seek`. */
    this.pendingSeek = null;
    this.el.addEventListener('loadedmetadata', () => {
      if (this.pendingSeek === null) return;
      this.el.currentTime = Math.min(this.pendingSeek, this.el.duration || this.pendingSeek);
      this.pendingSeek = null;
    });
    live.add(this);
  }

  get isPlaying() {
    return !this.el.paused && !this.el.ended;
  }

  /**
   * How long the recording is, in seconds, or 0 while nothing knows.
   *
   * The element's own duration is the truth once it has any, and the feed's
   * number is what stands in before that. They disagree by a second or two on
   * some episodes — the feed rounds — which is why the element wins as soon as
   * it can answer.
   */
  get duration() {
    const known = this.el.duration;
    return Number.isFinite(known) && known > 0 ? known : this.declaredDuration;
  }

  /**
   * Where the playhead is, or where it is going to be.
   *
   * Not the same as `currentTime` while a seek is pending: tapping the bar at
   * 2:27 before the first Play leaves the element at 0, and a skip button that
   * read the element would jump to 0:15 from a bar reading 2:27.
   */
  get position() {
    return this.pendingSeek ?? this.el.currentTime;
  }

  /**
   * Move the playhead, whether or not the file has loaded.
   *
   * A streamed episode is `preload="none"`, so for most of this screen's life
   * there is no media to seek within: assigning `currentTime` would be dropped
   * on the floor and the bar would spring back. So a seek made that early is
   * held and applied the moment the browser reports the duration — which is
   * what makes the bar draggable before the first tap on Play.
   */
  seek(seconds) {
    const target = clampTime(seconds, this.duration);
    if (this.el.readyState > 0) {
      this.el.currentTime = target;
      this.pendingSeek = null;
    } else {
      this.pendingSeek = target;
    }
    return target;
  }

  async play() {
    unlock();
    try {
      // A two-second dictionary clip is *replayed* — starting over is the
      // whole point of the button. A nine-minute episode is *resumed*:
      // rewinding to zero every time someone pauses to think would make a long
      // recording unusable. A clip someone has just scrubbed is neither: it
      // starts where they put it.
      if (!this.remote && this.pendingSeek === null) this.el.currentTime = 0;
      await this.el.play();
      this.plays += 1;
      return true;
    } catch {
      // Autoplay refusal or a decode failure — the caller shows the transcript
      // instead of leaving the user stuck with silent audio.
      return false;
    }
  }

  /** Hold position. What a pause button on long audio should do. */
  pause() {
    this.el.pause();
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
