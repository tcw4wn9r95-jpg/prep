'use strict';

/**
 * The seek bar's arithmetic, and the one piece of it that is not obvious: a
 * seek made before there is anything to seek.
 *
 * A streamed episode is `preload="none"`, so for most of the episode screen's
 * life the media element holds no file — `currentTime` can be assigned and
 * silently dropped, and `duration` is NaN. The bar still has to be draggable
 * then, because the first thing somebody does with a nine-minute recording is
 * move it. So the position lives in the Clip until the browser has a file to
 * put it in, and `position` — not `currentTime` — is what everything on screen
 * reads. Getting that wrong sent the skip buttons back to 0:15 from a bar
 * reading 2:27.
 *
 * `renderScrubber` itself is DOM, and is driven in app-walkthrough.js.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');

/** Just enough of HTMLAudioElement for Clip: nothing here decodes anything. */
class FakeAudio {
  constructor() {
    this.listeners = new Map();
    this.paused = true;
    this.ended = false;
    this.currentTime = 0;
    this.duration = NaN;
    this.readyState = 0;
    this.preload = '';
    this.src = '';
    this.muted = false;
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  removeEventListener(type, handler) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((one) => one !== handler));
  }

  /** The browser has read the file header: duration known, seeking possible. */
  loads(duration) {
    this.duration = duration;
    this.readyState = 1;
    for (const handler of this.listeners.get('loadedmetadata') ?? []) handler();
  }

  play() {
    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }
}

let audio;
test.before(async () => {
  globalThis.Audio = FakeAudio;
  audio = await import(pathToFileURL(path.join(ROOT, 'app', 'js', 'audio.js')).href);
});

/* ------------------------------------------------------------ the numbers */

test('audio: a position reads as minutes and seconds', () => {
  assert.equal(audio.formatClock(0), '0:00');
  assert.equal(audio.formatClock(7), '0:07');
  assert.equal(audio.formatClock(67), '1:07');
  assert.equal(audio.formatClock(512), '8:32');
  // Mid-second positions round down, so the label never reads one second more
  // than the bar has reached.
  assert.equal(audio.formatClock(59.9), '0:59');
  // NaN is what `duration` is before a file loads; it must not render "NaN:aN".
  assert.equal(audio.formatClock(NaN), '0:00');
  assert.equal(audio.formatClock(-5), '0:00');
});

test('audio: a seek is clamped to the recording, and left alone when its length is unknown', () => {
  assert.equal(audio.clampTime(30, 512), 30);
  assert.equal(audio.clampTime(-30, 512), 0);
  // Past the end: some browsers reload a stream from zero when asked to seek
  // beyond it, which is the one failure a seek bar must not have.
  assert.equal(audio.clampTime(900, 512), 512);
  // Nothing knows the length yet, so there is no end to clamp to.
  assert.equal(audio.clampTime(900, 0), 900);
  assert.equal(audio.clampTime(900, NaN), 900);
});

test('audio: progress is a fraction, and is zero rather than NaN before loading', () => {
  assert.equal(audio.progressOf(0, 512), 0);
  assert.equal(audio.progressOf(256, 512), 0.5);
  assert.equal(audio.progressOf(900, 512), 1);
  assert.equal(audio.progressOf(30, 0), 0);
  assert.equal(audio.progressOf(30, NaN), 0);
});

/* ------------------------------------------------- seeking before loading */

test('audio: the feed duration scales the bar until the file says otherwise', () => {
  const clip = new audio.Clip('https://cdn.example/ep.mp3', { duration: 512 });
  assert.equal(clip.duration, 512, 'the bar needs a scale before the first play');
  // The element wins as soon as it can answer: the feed rounds, and the two
  // disagree by a second or so on some episodes.
  clip.el.loads(509.4);
  assert.equal(clip.duration, 509.4);
});

test('audio: a seek made before the file loads is held, not lost', () => {
  const clip = new audio.Clip('https://cdn.example/ep.mp3', { duration: 512 });
  clip.seek(147);
  // Nothing to seek within yet, so the element has not moved…
  assert.equal(clip.el.currentTime, 0);
  // …but everything on screen reads this, so the bar sits at 2:27.
  assert.equal(clip.position, 147);
  clip.el.loads(512);
  assert.equal(clip.el.currentTime, 147, 'the held seek must be applied once there is a file');
  assert.equal(clip.position, 147);
});

test('audio: a skip steps from where the bar is, not from where the element is', () => {
  // The bug this guards: tap the bar to 2:27 before the first play, press
  // +15s, and the playhead jumped to 0:15 because the element still read 0.
  const clip = new audio.Clip('https://cdn.example/ep.mp3', { duration: 512 });
  clip.seek(147);
  clip.seek(clip.position + audio.SKIP_SECONDS);
  assert.equal(clip.position, 147 + audio.SKIP_SECONDS);
  clip.seek(clip.position - audio.SKIP_SECONDS);
  assert.equal(clip.position, 147);
  // And back past the start stops at the start.
  clip.seek(clip.position - 600);
  assert.equal(clip.position, 0);
});

test('audio: a loaded clip seeks straight away', () => {
  const clip = new audio.Clip('https://cdn.example/ep.mp3', { duration: 512 });
  clip.el.loads(512);
  clip.seek(300);
  assert.equal(clip.el.currentTime, 300);
  assert.equal(clip.pendingSeek, null, 'nothing should be left pending once it has been applied');
});

test('audio: playing a scrubbed clip starts where it was put', async () => {
  // A dictionary clip is replayed from zero — that is what its button is for —
  // but not when somebody has just moved the playhead themselves.
  const local = new audio.Clip('abc123');
  local.el.loads(4);
  local.el.currentTime = 2;
  await local.play();
  assert.equal(local.el.currentTime, 0, 'a short clip replays from the start');

  const scrubbed = new audio.Clip('abc123');
  scrubbed.seek(3);
  await scrubbed.play();
  assert.equal(scrubbed.el.currentTime, 0, 'nothing is loaded, so the seek is still pending');
  scrubbed.el.loads(10);
  assert.equal(scrubbed.el.currentTime, 3, 'and it lands where it was put, not at zero');
});

test('audio: an episode resumes rather than restarting', async () => {
  const clip = new audio.Clip('https://cdn.example/ep.mp3', { duration: 512 });
  clip.el.loads(512);
  clip.el.currentTime = 200;
  clip.pause();
  await clip.play();
  assert.equal(clip.el.currentTime, 200, 'rewinding a long recording on every pause makes it unusable');
});
