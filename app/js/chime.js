/**
 * The correct-answer sound.
 *
 * Synthesised with the Web Audio API rather than shipped as a file: it is a
 * few hundred bytes of code instead of an asset to mirror, cache and precache,
 * and the pitch has to be computed at play time anyway (see below).
 *
 * ── What the evidence actually supports ──────────────────────────────────
 *
 * The brief was "a sound that triggers a dopamine release". Nothing in the
 * literature licenses that claim for a UI chime, and this file does not make
 * it. What the research does support is four design constraints, and those are
 * what is implemented:
 *
 * 1. **Reward prediction error, not reward.** Schultz's dopamine neurons fire
 *    on the *difference* between expected and received reward. A fully
 *    predicted reward produces almost no response at all. So the single
 *    identical ping most apps use is the one design guaranteed to stop working:
 *    by the fiftieth card it is perfectly predicted and signals nothing.
 *    → The sound is never the same twice in a row while a streak is running.
 *
 * 2. **Anticipation is its own reward, in its own place.** Salimpoor et al.
 *    (Nature Neuroscience, 2011) found dopamine release in the caudate during
 *    the *anticipation* of a musical peak and in the nucleus accumbens at the
 *    peak itself — anatomically distinct. A sound with somewhere to go is worth
 *    more than a sound that just arrives.
 *    → Each correct answer climbs a step, so there is always a next rung
 *      audible from where you are standing.
 *
 * 3. **Ascending contour reads as positive.** Rising pitch maps to positive
 *    valence and high arousal; falling maps to closure or sadness.
 *    → Every chime is two notes, low then high.
 *
 * 4. **Simple frequency ratios are heard as consonant.** The octave (2:1) and
 *    perfect fifth (3:2) are the least ambiguous of these.
 *    → The two notes are a perfect fifth apart, and the ladder they climb is a
 *      major pentatonic scale, which has no dissonant interval in it — so any
 *      two rungs still sound good together however fast the streak moves.
 *
 * ── The deliberate choice not to make it a slot machine ──────────────────
 *
 * Point 1 has an obvious cynical reading: variable-*ratio* reward — paying out
 * unpredictably — is the strongest reinforcement schedule known, and it is the
 * casino's. It would work here. It is not what this does, because a random
 * payout is uncorrelated with whether the learner is doing well, and this app
 * has to stay a truthful instrument: everything else on screen reports real
 * state. So the variation is *earned* — pitch tracks the current run of correct
 * answers, and drops back on a miss. It stays unpredictable in the way that
 * matters (you cannot know which note comes next without knowing how you are
 * doing) while still being information rather than noise.
 *
 * Sources:
 *   Schultz, Predictive Reward Signal of Dopamine Neurons, J Neurophysiol 1998
 *     https://journals.physiology.org/doi/full/10.1152/jn.1998.80.1.1
 *   Salimpoor et al., Anatomically distinct dopamine release…, Nat Neurosci 2011
 *     https://www.nature.com/articles/nn.2726
 */

import { anyClipPlaying } from './audio.js';

/**
 * Major pentatonic, in semitones. Pentatonic because it contains no minor
 * second and no tritone: whichever two rungs land next to each other, the pair
 * is consonant. A major scale would eventually put a semitone clash in the
 * sequence.
 */
const LADDER = [0, 2, 4, 7, 9, 12];

/** C5. High enough to cut through without being shrill at the top rung. */
const ROOT_HZ = 523.25;

/** The second note, a perfect fifth up (3:2). */
const FIFTH = 1.5;

const PEAK_GAIN = 0.18;

let ctx = null;
let streak = 0;
let enabled = true;

/** Called from main.js on boot and from Settings on save. */
export function setChimeEnabled(value) {
  enabled = Boolean(value);
}

/**
 * Back to the bottom rung. A miss should cost the height that was climbed —
 * that is what makes the height mean anything.
 */
export function resetChimeStreak() {
  streak = 0;
}

/** For tests and for the Settings preview, which should not move the streak. */
export function chimeStreak() {
  return streak;
}

/**
 * The frequency pair for a given streak position. Pure, so the ladder can be
 * tested without an AudioContext.
 */
export function tonesForStreak(position) {
  const rung = LADDER[Math.min(position, LADDER.length - 1)];
  const low = ROOT_HZ * 2 ** (rung / 12);
  return { low, high: low * FIFTH, capped: position >= LADDER.length - 1 };
}

function audioContext() {
  if (ctx) return ctx;
  const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

/**
 * One note: a sine with a quiet octave above it.
 *
 * The added octave is what stops it sounding like a hearing test — it gives a
 * struck, bell-ish timbre while staying a simple ratio, so it cannot introduce
 * roughness. The attack is fast but not instant: ramping from silence over a
 * few milliseconds avoids the click that a hard start produces.
 */
function note(context, { freq, at, duration, gain }) {
  const envelope = context.createGain();
  envelope.connect(context.destination);

  const fundamental = context.createOscillator();
  fundamental.type = 'sine';
  fundamental.frequency.value = freq;
  fundamental.connect(envelope);

  const octave = context.createOscillator();
  octave.type = 'sine';
  octave.frequency.value = freq * 2;
  const octaveGain = context.createGain();
  octaveGain.gain.value = 0.16;
  octave.connect(octaveGain);
  octaveGain.connect(envelope);

  // exponentialRamp cannot reach or leave zero, hence the tiny floor.
  const floor = 0.0001;
  envelope.gain.setValueAtTime(floor, at);
  envelope.gain.exponentialRampToValueAtTime(gain, at + 0.008);
  envelope.gain.exponentialRampToValueAtTime(floor, at + duration);

  for (const osc of [fundamental, octave]) {
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }
}

/**
 * Play the correct-answer sound and take one step up the ladder.
 *
 * @param {{advance?: boolean}} options `advance: false` plays the current rung
 *   without climbing — used for an answer that was right but not clean, which
 *   holds its Leitner box for the same reason.
 */
export function chimeCorrect({ advance = true } = {}) {
  if (!enabled) return;

  // Never talk over the exam. The B1 half is scored on hearing connected
  // Luxembourgish, and a chime on top of a native recording is the one place
  // this feature could actively make someone worse at the thing being trained.
  if (anyClipPlaying()) return;

  // Nothing below may break the caller. This is decoration hanging off the
  // answer handler of every drill: a browser that refuses an AudioContext, or
  // one left in a state that rejects scheduling, must cost the learner a sound
  // and nothing else. Without this the drill's Next button never appears.
  try {
    const context = audioContext();
    if (!context) return;
    // Safari suspends the context until a gesture; every call here is inside a tap.
    if (context.state === 'suspended') context.resume().catch(() => {});

    const { low, high, capped } = tonesForStreak(streak);
    const now = context.currentTime;

    note(context, { freq: low, at: now, duration: 0.13, gain: PEAK_GAIN });
    note(context, { freq: high, at: now + 0.058, duration: 0.19, gain: PEAK_GAIN });
    // At the top rung the octave joins as a third note, so a long run still has
    // somewhere to arrive rather than flattening into repetition.
    if (capped) note(context, { freq: low * 2, at: now + 0.116, duration: 0.26, gain: PEAK_GAIN * 0.8 });
  } catch {
    // Sound is optional; the card is not.
    ctx = null; // a context that threw is not worth reusing
  }

  if (advance) streak = Math.min(streak + 1, LADDER.length - 1);
}

/** Plays the bottom rung once, for the Settings preview. Leaves the streak alone. */
export function chimePreview() {
  const saved = streak;
  streak = 0;
  const wasEnabled = enabled;
  enabled = true;
  chimeCorrect({ advance: false });
  enabled = wasEnabled;
  streak = saved;
}
