# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project type

Static, build-less browser app. The browser code has no bundler — `index.html` loads source files as native ES modules (`<script type="module">`), with external libs (Firebase 10.7.1, moment.js, normalize.css) from CDNs. There IS a `package.json`, but it exists only for testing — `npm install` pulls Vitest, jsdom, and moment as devDependencies and nothing else is needed at runtime.

## Running locally

There is no build step. Open `index.html` via any static server, e.g.:

```powershell
python -m http.server 8000
# then visit http://localhost:8000
```

Opening the file directly with `file://` will break ES module imports and the Firebase auth popup, so always use a server.

## Deploying

GitHub Pages serves this repo from `master` root at https://davidtbilisi.github.io/EventManager/ (classic Pages, no workflow file) — pushing to `master` *is* the deploy. There is nothing to build.

Pages sends `cache-control: max-age=600` on every asset and caches each ES module under its own URL, so `index.html` carries an **import map** that appends `?v=N` to every module `main.js` reaches, plus the same query on `main.js` and `style.css`. Without it a deploy can pair a fresh `main.js` with a 10-minute-stale `helpers.js` and break the import graph outright.

**Bump the version on every deploy that changes a JS or CSS file:**

```powershell
sed -i 's/?v=1/?v=2/g' index.html seed.html
```

`tests/assetVersioning.test.js` fails if a module in the graph is missing from the map, if the map lists a module that is no longer imported, or if the versions drift apart — so adding a new `js/*.js` module means adding its import-map entry too.

## Tests

```powershell
npm install        # one-time
npm test           # run the suite once
npm run test:watch # interactive watcher
```

Vitest + jsdom. Tests live in `tests/` and cover `Event`, `EventsHtml`, `HybridStorage` (cookie path + Firestore mocked via `vi.mock`), and the extracted `helpers.js` / `theme.js` modules. `tests/setup.js` exposes `moment` as a global (since `Events.js` relies on the CDN script at runtime) and clears cookies + localStorage between tests. Firestore is mocked at the import boundary — no real network calls.

## Architecture

The entry point is `js/main.js`. The wiring is:

```
index.html ──► js/main.js ──► AuthService ──► firebase-config.js (Firebase Auth + Firestore)
                          └─► HybridStorage ──┘
                          └─► EventsCountdown ──► Event (moment-based countdown model)
                          └─► EventsHtml (renders <ul#events>)
```

Key cross-file behaviors that are not obvious from reading any single file:

- **Two parallel data shapes.** Storage (cookies / Firestore) uses plain objects with `{ title, start, end, recurrence?, until? }` where `start`/`end` are ISO datetime strings from `<input type="datetime-local">`, `recurrence` is one of `"none" | "daily" | "weekly" | "monthly" | "yearly"`, and `until` is an optional `YYYY-MM-DD` date-only string. The countdown layer (`Event`, `EventsCountdown`, `EventsHtml`) uses `{ name, date, endDate, recurrence }` with moment objects. `main.js#render` is the translation point — `new Event(e.title, e.start, e.end, e.id, e.recurrence)`.

- **Recurring events are expanded at render time, not in storage.** `js/recurrence.js#computeOccurrence` advances a recurring event's start/end to the next occurrence > now (bounded by `until`). `main.js` runs this every tick to build `displayEvents`, so cards, sort order, and stats all use the displayed occurrence — but edit-mode reads back from `cachedEvents` so the user sees and edits the original seed date. ICS export emits `RRULE:FREQ=...;UNTIL=...`; CSV adds `recurrence,until` columns.

- **Hybrid storage with silent fallback.** `HybridStorage` routes every read/write through `authService.isAuthenticated()`. Authenticated users hit Firestore; anonymous users use a single `events=` cookie containing the JSON array. On any Firebase failure, calls fall back to cookies and log a warning — they do not throw. When extending storage, preserve both branches.

- **Edits/removes do a full collection rewrite in cloud mode.** `HybridStorage.updateEvent` / `removeEvent` (and `saveAllEvents`) call `clearFirebaseEvents` then re-`addDoc` everything. Indices are positional into the array returned by `getEventsFromFirebase`, which has no stable order guarantee from Firestore. If you add reordering, sorting, or partial updates, this assumption breaks.

- **Index-by-content matching for edit/remove buttons.** `addEventActions` in `main.js` finds the "original" index by matching `title + start + end` against the unsorted storage array. Two events with identical fields are indistinguishable to the UI — keep this in mind before adding deduplication or relying on the index.

- **Full-screen view is a separate, long-lived overlay.** `js/EventFocus.js` builds one `#event-focus` dialog on first open and appends it to `<body>`; `main.js#render` calls `eventFocus.sync(...)` at the end of every tick so the overlay's countdown advances in step with the cards. It is opened by event id (card click, or the per-card "Open" action) and closes itself when that id vanishes from storage. The screen button asks for native `requestFullscreen` on top of that and hides itself if the browser refuses (permissions policy in embedded/automated tabs). Because the card list is rebuilt each tick, `rememberCardFocus`/`restoreCardFocus` in `main.js` re-focus the equivalent button after the rebuild — without them keyboard focus falls to `<body>` once a second.

- **Full re-render every second.** `main.js` calls `setInterval(renderAllEvents, 1000)`, which re-fetches from storage and re-builds the DOM. In authenticated mode this is a Firestore read per second per open tab. Don't add expensive work inside `renderAllEvents` without addressing this.

- **moment is a global.** `Event.js` uses `moment(...)` without importing it; it's loaded via the `<script>` tag in `index.html`. Don't try to `import moment` in module files.

- **Auth-state migration.** When the user signs in, `authService.onAuthStateChanged` triggers `storage.migrateCookiesToCloud()`, which copies cookie events into Firestore via `saveAllEvents` — i.e., it wipes any existing cloud events for that user first. The cookie is intentionally not cleared (see commented line in `migrateCookiesToCloud`).

## Firebase

Config lives in `js/firebase-config.js` and is committed (this is normal for client-side Firebase — security is enforced by Firestore rules, not by hiding the API key). The Firestore collection is `events`, scoped per user via a `userId` field equal to `auth.currentUser.uid`. There is no Firebase tooling in the repo (no `firebase.json`, no Functions, no emulator config) — security rules are managed in the Firebase Console for project `eventmanagerdavidtbilisi`.

## Import / export / Google Calendar

`js/dataIO.js` handles iCalendar (.ics) and CSV serialize/parse plus a `dedupeAgainst` helper that matches on title + start + end. `js/calendar.js` does a one-way pull from the user's primary Google Calendar by triggering a fresh `signInWithPopup` with the `calendar.readonly` scope and calling the Calendar v3 REST API directly with the returned access token. The "Pull from Google Calendar" button only works after the Calendar API is enabled in the `eventmanagerdavidtbilisi` GCP project AND `calendar.readonly` is added to the OAuth consent screen scopes — otherwise the popup throws an OAuth error. All imports route through `dedupeAgainst` and `storage.saveEvent`, so Firestore rewrite semantics still apply.

## Dev tools

`seed.html` (root) is a standalone dev page for stress-testing the layout. Pick a count + distribution (mixed / all-future / all-past / near-term / far-out), click "Seed & view", and it writes mock events into the cookie and bounces you back to `index.html`. Cookie-only by design — it deliberately does **not** write to Firestore so it can't pollute a real cloud account. If signed-in events don't show up, that's expected: sign out to read from cookies.

## Files that look load-bearing but aren't

- `js/LocalStorage.js` and `js/FormHandler.js` — not imported anywhere; legacy from before the cookie/Firebase split. Don't wire new code into them without checking.
- `js/data.json` — sample data, not loaded by the app.
- `js/EventsCountdown.prepareTimelineData` — left over from the Google Charts era and never called.
