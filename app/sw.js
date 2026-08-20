/**
 * Service worker.
 *
 * The requirement is blunt: this has to work on a phone with no signal. So the
 * shell, the generated items and every mirrored recording are precached on
 * install, and the app is served cache-first afterwards.
 *
 * The audio manifest is fetched at install time rather than inlined, so adding
 * recordings does not mean hand-editing this file.
 */

// Bump this on every change to the shell. The app is served cache-first, so a
// stale version is not a slow update — it is a returning user permanently
// looking at the old app while wondering where their changes went.
const VERSION = 'v46';
const SHELL_CACHE = `shell-${VERSION}`;
const AUDIO_CACHE = `audio-${VERSION}`;

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/base.css',
  'css/components.css',
  'css/amelie.css',
  'js/main.js',
  'js/dom.js',
  'js/store.js',
  'js/audio.js',
  'js/chime.js',
  'js/amelie.js',
  'js/content.js',
  'js/grammar-guide.js',
  'js/grammar-examples.js',
  'js/recorder.js',
  'js/sync.js',
  'js/screens/onboarding.js',
  'js/screens/today.js',
  'js/screens/journey.js',
  'js/screens/learn.js',
  'js/screens/session.js',
  'js/screens/reference.js',
  'js/screens/pairs.js',
  'js/screens/podcasts.js',
  'js/screens/vocab.js',
  'js/screens/verbs.js',
  'js/flag.js',
  'js/screens/listening.js',
  'js/screens/speaking.js',
  'js/screens/review.js',
  'js/screens/mistakes.js',
  'js/screens/readiness.js',
  'js/screens/duel.js',
  'js/screens/settings.js',
  'js/screens/phrases.js',
  'js/screens/grammar.js',
  'js/screens/structure.js',
  'js/screens/notecards.js',
  'js/screens/gender-sort.js',
  'js/screens/objects.js',
  'js/screens/forms.js',
  'js/screens/arcade.js',
  'js/screens/verb-arcade.js',
  'js/arcade/patterns.js',
  'js/arcade/verbs.js',
  'js/arcade/brief.js',
  'js/anthropic.js',
  'js/drill/engine.js',
  'js/drill/cards.js',
  'js/drill/inputs.js',
  'js/drill/match.js',
  'js/drill/hint.js',
  'js/drill/reference-sheet.js',
  'data/topics.json',
  'data/listening.json',
  'data/interviews.json',
  'data/images.json',
  'data/word-images.json',
  'data/vocab.json',
  'data/verbs.json',
  'data/phrases.json',
  'data/grammar.json',
  // Episode metadata only. The audio itself is cross-origin and the fetch
  // handler below returns early for that, so episodes are never stored.
  'data/podcasts.json',
  // version.json deliberately does NOT belong here, and not under data/
  // either: that is what lets Settings answer "is this the latest deploy?"
  // truthfully — see loadDeployInfo() in js/content.js.
  'assets/icon.svg',
  'assets/icon-180.png',
];

/**
 * Fetches an items-file (images.json's own shape: `{ items: [{ imageUrl }] }`)
 * and precaches every locally-mirrored photo it lists, into `cache`. Shared
 * by the image-description photos and the picture-naming game's photos —
 * same shape, same "best effort, a missing one degrades a single question"
 * reasoning, so one function rather than two copies that could drift.
 */
async function precacheImageUrls(cache, jsonPath) {
  try {
    const response = await fetch(jsonPath);
    if (!response.ok) return;
    const { items } = await response.json();
    await Promise.all(
      (items ?? [])
        .map((item) => item.imageUrl)
        .filter((url) => url && !/^https?:/i.test(url))
        .map((url) => cache.add(url).catch(() => {})),
    );
  } catch (error) {
    console.warn('[sw] image precache skipped', jsonPath, error.message);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      // addAll is atomic: one 404 and nothing is cached, which would leave the
      // app half-offline. Add individually and let optional files fail.
      await Promise.all(
        SHELL.map((url) => shell.add(url).catch((error) => console.warn('[sw] skipped', url, error.message))),
      );

      // Recordings and images: many files, so they get their own cache and a
      // best-effort pass. A missing clip degrades one question, not the app.
      const media = await caches.open(AUDIO_CACHE);

      try {
        const response = await fetch('data/audio-manifest.json');
        if (response.ok) {
          const { files } = await response.json();
          await Promise.all(files.map((url) => media.add(url).catch(() => {})));
        }
      } catch (error) {
        console.warn('[sw] audio precache skipped', error.message);
      }

      // Image-description photos, so part 2b works with no signal too, and
      // the "What is this?" object photos for the same reason.
      await precacheImageUrls(media, 'data/images.json');
      await precacheImageUrls(media, 'data/word-images.json');

      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, AUDIO_CACHE]);
      for (const key of await caches.keys()) {
        if (!keep.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never cache the Worker: shared state must not be served stale.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;

      try {
        const response = await fetch(request);
        // Cache generated content and audio as they are first used.
        if (response.ok && (url.pathname.includes('/assets/audio/') || url.pathname.includes('/data/'))) {
          const cache = await caches.open(url.pathname.includes('/assets/audio/') ? AUDIO_CACHE : SHELL_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        // Offline and not cached: for a navigation, fall back to the shell so
        // the app still boots and can explain itself.
        if (request.mode === 'navigate') {
          const shell = await caches.match('index.html');
          if (shell) return shell;
        }
        throw error;
      }
    })(),
  );
});
