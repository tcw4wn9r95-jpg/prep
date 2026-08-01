/**
 * Bootstrap and router.
 *
 * A hash router, because the app is deployed to GitHub Pages as static files
 * and a path router would 404 on refresh. No framework: the screens each
 * render into one container and clean up after themselves.
 */

import { getSettings, saveSettings } from './store.js';
import { el } from './dom.js';
import * as onboarding from './screens/onboarding.js';
import * as today from './screens/today.js';
import * as journey from './screens/journey.js';
import * as learn from './screens/learn.js';
import * as session from './screens/session.js';
import * as reference from './screens/reference.js';
import * as vocab from './screens/vocab.js';
import * as verbs from './screens/verbs.js';
import * as phrases from './screens/phrases.js';
import * as listening from './screens/listening.js';
import * as speaking from './screens/speaking.js';
import * as review from './screens/review.js';
import * as readiness from './screens/readiness.js';
import * as duel from './screens/duel.js';
import * as settings from './screens/settings.js';

const ROUTES = {
  '': today,
  today,
  journey,
  learn,
  session,
  reference,
  vocab,
  verbs,
  phrases,
  listening,
  speaking,
  review,
  readiness,
  duel,
  settings,
  onboarding,
};

// Four tabs, not six. `today` is the only starting point — it decides what to
// do next and links onwards, so `journey` (the listening path), `review`,
// `readiness` and `settings` are all still routable but no longer compete for
// attention with it.
const TABS = [
  { route: 'today', label: 'Today', icon: 'M12 3 L20 9 v11 H4 V9 Z M9 20 v-6 h6 v6' },
  { route: 'learn', label: 'Learn', icon: 'M4 6 L12 3 L20 6 L12 9 Z M4 6 v9 L12 18 L20 15 v-9 M12 9 v9' },
  { route: 'speaking', label: 'Speak', icon: 'M12 3 v10 M12 3 a3 3 0 0 1 3 3 v4 a3 3 0 0 1 -6 0 v-4 a3 3 0 0 1 3 -3 Z M5 11 a7 7 0 0 0 14 0 M12 18 v3' },
  { route: 'duel', label: 'Duel', icon: 'M5 20 L19 6 M14 4 h6 v6 M9 20 H4 v-5' },
];

const screenEl = document.getElementById('screen');
const tabbarEl = document.getElementById('tabbar');
const updateBannerEl = document.getElementById('update-banner');
updateBannerEl?.addEventListener('click', () => location.reload());

let current = null;
/**
 * Renders are async (screens await their content), and both `hashchange` and
 * an explicit call can start one. Without a generation token two renders
 * interleave and each appends its own DOM — which showed up as duplicated
 * player buttons on the first screen. Only the newest render may touch the DOM.
 */
let generation = 0;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [name, ...rest] = raw.split('/');
  // Topic ids carry Luxembourgish spelling ("kreativitéit", "joreszäiten"), and
  // the browser percent-encodes those in location.hash. Without decoding, every
  // accented topic looks like an unknown one.
  return { name: name || '', params: rest.map(safeDecode) };
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value; // malformed escape: use it raw rather than throwing at boot
  }
}

function renderTabs(activeRoute) {
  tabbarEl.replaceChildren(
    ...TABS.map((tab) =>
      el(
        'a',
        {
          class: 'tabbar__item',
          href: `#/${tab.route}`,
          'aria-current': tab.route === activeRoute ? 'page' : null,
        },
        el('svg', { class: 'tabbar__icon', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, el('path', { d: tab.icon })),
        el('span', {}, tab.label),
      ),
    ),
  );
}

async function route() {
  const token = (generation += 1);
  const { name, params } = parseHash();
  const settings = await getSettings();
  if (token !== generation) return; // a newer navigation overtook us

  // Everything except onboarding needs a chosen player.
  if (!settings.playerId && name !== 'onboarding') {
    location.hash = '#/onboarding';
    return;
  }

  const screen = ROUTES[name] ?? journey;
  const routeName = ROUTES[name] ? name || 'journey' : 'journey';

  if (current?.destroy) {
    try {
      current.destroy();
    } catch (error) {
      console.error('screen cleanup failed', error);
    }
  }

  screenEl.replaceChildren();
  screenEl.className = 'screen';
  screenEl.scrollTop = 0;

  const showTabs = routeName !== 'onboarding';
  tabbarEl.hidden = !showTabs;
  if (showTabs) renderTabs(routeName);

  const rendered = await screen.render(screenEl, { params, settings, navigate });
  if (token !== generation) {
    rendered?.destroy?.();
    return;
  }
  current = rendered;
  // Move focus to the screen so a screen reader announces the change without
  // trapping the user at the top of the document.
  screenEl.focus({ preventScroll: true });
  hideSplash();
}

// However fast the first render is, the splash stays up at least this long —
// otherwise it reads as a flicker rather than a deliberate brand moment.
const SPLASH_MIN_MS = 1500;
let splashHideScheduled = false;

/**
 * Removes the splash covering the app frame after the first render, holding
 * it for at least SPLASH_MIN_MS from navigation start. A no-op once it has
 * already run once — every route after the first finds nothing to remove, or
 * the scheduled-flag short-circuits it — so it is safe to call from every
 * path that can complete a first paint (the normal boot, the onboarding
 * redirect, and the error path).
 */
function hideSplash() {
  if (splashHideScheduled) return;
  const splashEl = document.getElementById('splash');
  if (!splashEl) return;
  splashHideScheduled = true;

  // performance.now() is already elapsed time since navigation start, i.e.
  // since the splash first painted — no separate start timestamp needed.
  const remaining = Math.max(0, SPLASH_MIN_MS - performance.now());
  window.setTimeout(() => {
    splashEl.classList.add('is-hidden');
    splashEl.addEventListener('transitionend', () => splashEl.remove(), { once: true });
    // Belt and suspenders: prefers-reduced-motion zeroes the transition, and
    // a removed/replaced node never fires transitionend either way.
    window.setTimeout(() => splashEl.remove(), 500);
  }, remaining);
}

export function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

/* ------------------------------------------------------------- lifecycle */

window.addEventListener('hashchange', route);

function reflectOnline() {
  document.body.classList.toggle('is-offline', !navigator.onLine);
}
window.addEventListener('online', reflectOnline);
window.addEventListener('offline', reflectOnline);

async function boot() {
  reflectOnline();

  // Ask Safari to keep IndexedDB: it evicts unused sites after 7 days unless
  // the PWA is installed or storage is marked persistent.
  if (navigator.storage?.persist) {
    navigator.storage.persisted().then((already) => {
      if (!already) navigator.storage.persist().catch(() => {});
    });
  }

  if ('serviceWorker' in navigator) {
    // Registered after load so it never competes with the first render.
    window.addEventListener('load', () => {
      // sw.js calls skipWaiting()+clients.claim(), so a new version takes
      // control of this very tab as soon as the browser notices it — no
      // waiting for every tab to close. But the page already running is
      // still the old code; `controllerchange` is the signal that a newer
      // worker just took over, and only a reload actually picks it up.
      //
      // The very first activation ever (a brand-new install, no prior
      // controller) fires this event too, and must not show the banner —
      // that is not an update, it is the app arriving for the first time.
      // Only that one event is exempt: `hadController` covers a repeat visit
      // where a worker was already active before this page even loaded, and
      // `firstControllerChangeSeen` covers the fresh-install case, where the
      // very first event is the exempt one and every event after it — a real
      // second activation, however soon — is a genuine update.
      const hadController = Boolean(navigator.serviceWorker.controller);
      let firstControllerChangeSeen = false;
      navigator.serviceWorker.register('sw.js').catch((error) => console.warn('service worker failed', error));
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        const isGenuineUpdate = hadController || firstControllerChangeSeen;
        firstControllerChangeSeen = true;
        if (isGenuineUpdate && updateBannerEl) updateBannerEl.hidden = false;
      });
    });
  }

  const settings = await getSettings();
  if (!settings.playerId && !location.hash) {
    // Setting the hash fires `hashchange`, which routes for us. Calling
    // route() as well would start a second, concurrent render.
    location.hash = '#/onboarding';
    return;
  }
  await route();
}

boot().catch((error) => {
  console.error(error);
  hideSplash();
  screenEl.replaceChildren(
    el('div', { class: 'empty' }, el('p', {}, 'The app failed to start.'), el('p', { class: 'source-note' }, String(error.message ?? error))),
  );
});

export { saveSettings };
