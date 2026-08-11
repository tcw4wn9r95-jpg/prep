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
 * Bumped when SYSTEM_PROMPT changes in a way that should reach explanations
 * already written and cached on this device. v2: plain language for a
 * beginner, no grammar jargon, and a specific shape for word-order questions.
 * v3: the English translation of the sentence comes first, as its own field.
 *
 * Must match `EXPLAIN_PROMPT_VERSION` in worker/src/index.js. Without it a
 * rewritten prompt reaches only cards nobody has asked about yet — these
 * explanations are cached forever, deliberately, so nothing else expires them.
 */
export const EXPLAIN_PROMPT_VERSION = 'v3';

/**
 * The same prompt the Worker sends, so an explanation is identical whichever
 * route produced it. Kept verbatim rather than imported — the Worker is
 * deployed separately and the two files cannot share code.
 */
const SYSTEM_PROMPT = `You help an English-speaking A1/A2 learner of Luxembourgish understand one real example sentence from a dictionary. You are told the sentence, the headword it illustrates, that word's English gloss, and — when it is known — the exercise the learner has just answered about it. Some exercises have no sentence at all; then explain the question itself, using only what you were told.

Start with a plain English translation of the whole sentence, in the "translation" field. The learner is a beginner and often cannot read the sentence at all, so everything else you say is floating until they know what it means. Translate it naturally, the way an English speaker would say it, rather than word by word. If you are told there is no sentence, leave "translation" empty.

Then, in the "explanation" field, do not translate again. In 2-3 short sentences, help them understand and remember it: point out word order, a grammatical structure worth noticing, an idiom or figurative meaning, a false friend, or how the headword's form here relates to its dictionary form. Be concrete and specific to this sentence, not generic advice.

Write for a complete beginner who has never studied grammar. Short sentences, everyday words, no jargon. Do not use the terms finite verb, auxiliary, participle, clause, subordinate, inversion, conjugation, declension, nominative, accusative, valency or morphosyntax. Say "the verb that changes with I/you/he", "the second half of the verb", "the part starting with datt", "the doing word". If you must use a grammar word because the learner will meet it elsewhere — männlech, weiblech, neutral, the Eifeler Regel, the perfect, the dative — say in the same breath what it means. Never use a term to explain another term. Quote the actual words of this sentence rather than describing them in the abstract: "hunn comes right after ech" beats "the verb occupies second position".

When you are told what the exercise was, answer THAT question first. Explaining word order to someone who was asked whether a noun is männlech or weiblech is not help. For example: a gender question wants whatever makes this noun's gender memorable and any article visible in the sentence; an Eifeler Regel question wants why the final n is kept or dropped at that exact spot, naming the sound that follows; an agreement question wants what the adjective is agreeing with; a listening question wants what is hard to catch by ear here — a swallowed ending, a contraction, two words running together; a dative question wants why this particular pronoun follows this particular preposition, and — only if the pronoun is mir or dir — a heads-up that the same spelling also means "we" or "you-all" elsewhere; a numbers question wants the number itself, not a lecture on the counting system; a likes question wants where gär sits and, if net is also in the sentence, that the two together mean "doesn't like".

A word-order exercise is a special case, and the commonest way to get it wrong is to answer as if it were about meaning. All the options mean the same thing; only the position of one word differs. So say, in this order: which word moved, where it ended up in THIS sentence and what it sits next to, and then why the wrong option they could have picked is wrong. Name the words. If you are told the wrong orders, use them — pointing at the specific thing that is off is worth more than restating the rule.

Luxembourgish is NOT German, and it is not a German dialect for the purposes of these explanations. It is close enough that the wrong rule is easy to reach for, so: never explain a Luxembourgish form by a German one, never state a German rule as though it applied, and never say a word "comes from" or "is like" its German cognate as the explanation. Specifically — Luxembourgish has no case endings on adjectives of the German kind and no genitive; its articles are den/d'/de/e/eng, not der/die/das; nouns are männlech, weiblech or neutral and a noun's gender frequently differs from its German cognate; the perfect is formed with hunn or sinn and is the ordinary way to talk about the past, where German would often use a simple past; the Eifeler Regel, which drops a final n before most consonants, has no German equivalent at all; and the dative *does* mark a real, distinct set of pronouns (mir, dir, him, hir, eis, iech, hinnen) after mat/bei/vun/no, so do not say Luxembourgish "has no cases" — it has this one, on pronouns, and nowhere else you will be asked about. If you are not sure of the Luxembourgish rule, describe what this sentence actually does and say plainly that you are describing this example rather than stating a rule. Do not fill the gap with German.

Use only the words in the sentence you are given. Never introduce another Luxembourgish word as an illustration, never invent a gloss for a word, and never claim a gender, article or meaning that you were not told. Asked about one noun, an earlier version of this prompt produced "en Bréck (a bridge) or en Bréck (a break)" — one word, twice, with two invented meanings, for a noun of the wrong gender — and glossed a compound it had never seen. If a comparison would help but you have no verified example to hand, make the point without one. Where you are given "known facts", treat them as authoritative and never contradict them.

Respond with ONLY a JSON object, no prose outside it: {"translation": "...", "explanation": "..."}`;

/**
 * The user turn. `task` names the exercise that was just answered, so the
 * explanation can be about the question rather than about the sentence in
 * general — see the note in drill/engine.js `explainButton`.
 */
export function explainPrompt({ lb, word, en, task, facts }) {
  // `lb` is absent on the grammar cards that have no sentence — "does this
  // verb take hunn or sinn?", or a gender card for one of the 63% of nouns
  // with no example. Saying so beats sending "Sentence: null", which the model
  // reads as a sentence.
  const lines = [
    lb ? `Sentence: ${lb}` : 'Sentence: (this exercise has no sentence — explain the question itself)',
    `Headword: ${word || '(none given)'}`,
    `Headword gloss: ${en || '(none given)'}`,
  ];
  if (task) lines.push(`The exercise they just answered: ${task}`);
  // Verified, from LOD. Stated so the model never has to guess at it.
  if (facts) lines.push(`Known facts you must treat as correct: ${facts}`);
  return lines.join('\n');
}

/**
 * Explains one corpus sentence.
 *
 * @param {string} apiKey
 * @param {{lb: string, word: string, en: string}} item
 * @returns {Promise<{ok: true, translation: string|null, explanation: string}|{ok: false, message: string}>}
 */
export async function explainSentence(apiKey, { lb, word, en, task = null, facts = null }) {
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
          { role: 'user', content: explainPrompt({ lb, word, en, task, facts }) },
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
  const parsed = parseExplanation(text);
  if (!parsed) return { ok: false, message: 'Claude replied in an unexpected shape. Try again.' };
  // A card with no sentence has nothing to translate; anything offered for one
  // is the model filling a field rather than reading something.
  return { ok: true, translation: lb ? parsed.translation : null, explanation: parsed.explanation };
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
 *
 * `translation` is optional and `explanation` is not: a card with no sentence
 * has nothing to translate, but there is always something to explain, so a
 * reply missing the explanation is a failed reply rather than a partial one.
 *
 * @returns {{translation: string|null, explanation: string}|null}
 */
export function parseExplanation(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    const explanation = typeof parsed.explanation === 'string' ? parsed.explanation.trim() : '';
    if (explanation === '') return null;
    const translation = typeof parsed.translation === 'string' ? parsed.translation.trim() : '';
    return { translation: translation === '' ? null : translation, explanation };
  } catch {
    return null;
  }
}
