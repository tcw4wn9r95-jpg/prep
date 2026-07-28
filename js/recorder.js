/**
 * MediaRecorder wrapper.
 *
 * The iOS detail that decides whether speaking works at all: Safari does not
 * produce `audio/webm`. It produces `audio/mp4`. Hard-coding webm — the usual
 * copy-paste default — throws `NotSupportedError` on every iPhone. So the
 * mime type is negotiated from what the browser actually reports.
 *
 * Recording also needs a secure context (https, or localhost) and an explicit
 * microphone permission, both of which fail loudly rather than silently here.
 */

/** In preference order: what we would like, then what Safari gives us. */
const CANDIDATE_TYPES = [
  'audio/mp4',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
];

export function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const type of CANDIDATE_TYPES) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return ''; // let the browser choose its own default
}

export function isSupported() {
  return typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

/** Why recording is unavailable, in words a user can act on. */
export function unsupportedReason() {
  if (!window.isSecureContext) return 'Recording needs a secure connection. Open the app over https.';
  if (!navigator.mediaDevices?.getUserMedia) return 'This browser will not give the page a microphone.';
  if (typeof MediaRecorder === 'undefined') return 'This browser has no MediaRecorder support.';
  return null;
}

export class Recorder {
  constructor({ maxMs = 5 * 60 * 1000, onTick, onStop } = {}) {
    this.maxMs = maxMs;
    this.onTick = onTick;
    this.onStop = onStop;
    this.chunks = [];
    this.stream = null;
    this.recorder = null;
    this.startedAt = 0;
    this.timer = null;
  }

  get isRecording() {
    return this.recorder?.state === 'recording';
  }

  get elapsedMs() {
    return this.startedAt === 0 ? 0 : Date.now() - this.startedAt;
  }

  async start() {
    const reason = unsupportedReason();
    if (reason) throw new Error(reason);

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    const mimeType = pickMimeType();
    this.recorder = mimeType ? new MediaRecorder(this.stream, { mimeType }) : new MediaRecorder(this.stream);
    this.mime = this.recorder.mimeType || mimeType || 'audio/mp4';
    this.chunks = [];

    this.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) this.chunks.push(event.data);
    };
    this.recorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: this.mime });
      this.releaseStream();
      this.onStop?.({ blob, mime: this.mime, durationMs: this.elapsedMs });
    };

    // A timeslice means we still get data if the tab is killed mid-answer.
    this.recorder.start(1000);
    this.startedAt = Date.now();

    this.timer = window.setInterval(() => {
      this.onTick?.(this.elapsedMs);
      if (this.elapsedMs >= this.maxMs) this.stop();
    }, 200);
  }

  stop() {
    window.clearInterval(this.timer);
    this.timer = null;
    if (this.recorder?.state === 'recording') this.recorder.stop();
    else this.releaseStream();
  }

  releaseStream() {
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
  }

  destroy() {
    window.clearInterval(this.timer);
    this.timer = null;
    if (this.recorder?.state === 'recording') {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.releaseStream();
  }
}
