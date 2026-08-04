/**
 * Calling Claude directly from the browser.
 *
 * The Worker exists so the API key can live on a server. That is the better
 * arrangement and stays the default. But standing up a Cloudflare Worker just
 * to get sentence explanations working is a lot of ceremony for a two-person
 * tool, so this is the other option: paste a key into Settings and the app
 * calls the API itself.
 *
 * **What that costs you, stated plainly.** A key stored here sits in this
 * device's IndexedDB. Anything that can run script on this origin can read it,
 * and so can anyone holding an unlocked phone. That is an acceptable trade for
 * a private tool with a spend-capped key; it would not be for a real product.
 * The Settings screen says so, and `keyWarning` below is the single source of
 * that wording so it cannot drift.
 *
 * The key is only ever sent to api.anthropic.com — never to the Worker, never
 * anywhere else. `ENDPOINT` is a constant for that reason: there is no code
 * path that can point it somewhere else.
 */

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

/**
 * Same model the Worker uses (worker/src/index.js). Explanations are short and
 * cached forever once written, so the cheap model is the right fit — and both
 * paths must produce the same thing, or an explanation would change depending
 * on which route happened to fetch it.
 */
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 250;

/** Shown wherever the key is entered or explained. One wording, one place. */
export const keyWarning =
  'The key is stored on this device only and is sent straight to Anthropic, never to the Worker. ' +
  'Anyone with this phone unlocked can read it — use a key with a spend limit, and revoke it if you lose the device.';

/** A key that is obviously not a key, caught before a request is wasted. */
export function looksLikeApiKey(value) {
  return /^sk-ant-\S{20,}$/.test(String(value ?? '').trim());
}

/**
 * The same prompt the Worker sends, so an explanation is identical whichever
 * route produced it. Kept verbatim rather than imported — the Worker is
 * deployed separately and the two files cannot share code.
 */
const SYSTEM_PROMPT = `You help an English-speaking A1/A2 learner of Luxembourgish understand one real example sentence from a dictionary. You are told the sentence, the headword it illustrates, that word's English gloss, and — when it is known — the exercise the learner has just answered about it.

Do NOT just translate the sentence — the learner already has the gloss. Instead, in 2-3 short sentences, help them understand and remember it: point out word order, a grammatical structure worth noticing, an idiom or figurative meaning, a false friend, or how the headword's form here relates to its dictionary form. Be concrete and specific to this sentence, not generic advice.

When you are told what the exercise was, answer THAT question first. Explaining word order to someone who was asked whether a noun is männlech or weiblech is not help. For example: a gender question wants whatever makes this noun's gender memorable and any article visible in the sentence; an Eifeler Regel question wants why the final n is kept or dropped at that exact spot, naming the sound that follows; an agreement question wants what the adjective is agreeing with; a listening question wants what is hard to catch by ear here — a swallowed ending, a contraction, two words running together.

Luxembourgish is NOT German, and it is not a German dialect for the purposes of these explanations. It is close enough that the wrong rule is easy to reach for, so: never explain a Luxembourgish form by a German one, never state a German rule as though it applied, and never say a word "comes from" or "is like" its German cognate as the explanation. Specifically — Luxembourgish has no case endings on adjectives of the German kind and no genitive; its articles are den/d'/de/e/eng, not der/die/das; nouns are männlech, weiblech or neutral and a noun's gender frequently differs from its German cognate; the perfect is formed with hunn or sinn and is the ordinary way to talk about the past, where German would often use a simple past; and the Eifeler Regel, which drops a final n before most consonants, has no German equivalent at all. If you are not sure of the Luxembourgish rule, describe what this sentence actually does and say plainly that you are describing this example rather than stating a rule. Do not fill the gap with German.

Respond with ONLY a JSON object, no prose outside it: {"explanation": "..."}`;

/**
 * The user turn. `task` names the exercise that was just answered, so the
 * explanation can be about the question rather than about the sentence in
 * general — see the note in drill/engine.js `explainButton`.
 */
export function explainPrompt({ lb, word, en, task }) {
  const lines = [`Sentence: ${lb}`, `Headword: ${word}`, `Headword gloss: ${en || '(none given)'}`];
  if (task) lines.push(`The exercise they just answered: ${task}`);
  return lines.join('\n');
}

/**
 * Explains one corpus sentence.
 *
 * @param {string} apiKey
 * @param {{lb: string, word: string, en: string}} item
 * @returns {Promise<{ok: true, explanation: string}|{ok: false, message: string}>}
 */
export async function explainSentence(apiKey, { lb, word, en, task = null }) {
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
        // Without this the browser preflight is refused. It is opt-in
        // precisely because it means a key is present in a browser — see the
        // trade-off noted at the top of this file.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: explainPrompt({ lb, word, en, task }) },
        ],
      }),
    });
  } catch (error) {
    // fetch only rejects on a transport failure, so this is offline, DNS, or a
    // blocked request — never an API error, which arrives as a status code.
    return { ok: false, message: `Could not reach Anthropic (${error.message}).` };
  }

  if (!response.ok) return { ok: false, message: await describeError(response) };

  const body = await response.json().catch(() => null);
  const text = body?.content?.find((block) => block.type === 'text')?.text ?? '';
  const explanation = parseExplanation(text);
  if (!explanation) return { ok: false, message: 'Claude replied in an unexpected shape. Try again.' };
  return { ok: true, explanation };
}

/** Turns an API error into something worth reading on a phone. */
async function describeError(response) {
  const body = await response.json().catch(() => null);
  const detail = body?.error?.message;

  if (response.status === 401) return 'That API key was rejected. Check it in Settings.';
  if (response.status === 403) return 'That key is not allowed to use this model.';
  if (response.status === 429) return 'Rate limited by Anthropic. Wait a moment and try again.';
  if (response.status === 400 && detail?.includes('credit')) return 'That key has no credit left.';
  if (response.status >= 500) return 'Anthropic is having trouble. Try again shortly.';
  return `Anthropic returned ${response.status}${detail ? ` — ${detail}` : ''}.`;
}

/**
 * The model is asked for bare JSON but may still wrap it in prose, so the
 * object is sliced out rather than the whole string parsed.
 */
function parseExplanation(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return typeof parsed.explanation === 'string' && parsed.explanation.trim() !== '' ? parsed.explanation : null;
  } catch {
    return null;
  }
}
