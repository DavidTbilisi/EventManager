# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project type

Static, build-less browser app. No `package.json`, no bundler, no tests, no lint config. Source files are loaded directly by `index.html` as native ES modules (`<script type="module">`). External libraries come from CDNs (Firebase 10.7.1, moment.js, Google Charts, normalize.css).

## Running locally

There is no build step. Open `index.html` via any static server, e.g.:

```powershell
python -m http.server 8000
# then visit http://localhost:8000
```

Opening the file directly with `file://` will break ES module imports and the Firebase auth popup, so always use a server.

## Architecture

The entry point is `js/main.js`. The wiring is:

```
index.html ──► js/main.js ──► AuthService ──► firebase-config.js (Firebase Auth + Firestore)
                          └─► HybridStorage ──┘
                          └─► EventsCountdown ──► Event (moment-based countdown model)
                          └─► EventsHtml (renders <ul#events>)
```

Key cross-file behaviors that are not obvious from reading any single file:

- **Two parallel data shapes.** Storage (cookies / Firestore) uses plain objects with `{ title, start, end }` where `start`/`end` are ISO datetime strings from `<input type="datetime-local">`. The countdown layer (`Event`, `EventsCountdown`, `EventsHtml`) uses `{ name, date, endDate }` with moment objects. `main.js#renderAllEvents` is the translation point — `new Event(e.title, e.start, e.end)`.

- **Hybrid storage with silent fallback.** `HybridStorage` routes every read/write through `authService.isAuthenticated()`. Authenticated users hit Firestore; anonymous users use a single `events=` cookie containing the JSON array. On any Firebase failure, calls fall back to cookies and log a warning — they do not throw. When extending storage, preserve both branches.

- **Edits/removes do a full collection rewrite in cloud mode.** `HybridStorage.updateEvent` / `removeEvent` (and `saveAllEvents`) call `clearFirebaseEvents` then re-`addDoc` everything. Indices are positional into the array returned by `getEventsFromFirebase`, which has no stable order guarantee from Firestore. If you add reordering, sorting, or partial updates, this assumption breaks.

- **Index-by-content matching for edit/remove buttons.** `addEventActions` in `main.js` finds the "original" index by matching `title + start + end` against the unsorted storage array. Two events with identical fields are indistinguishable to the UI — keep this in mind before adding deduplication or relying on the index.

- **Full re-render every second.** `main.js` calls `setInterval(renderAllEvents, 1000)`, which re-fetches from storage and re-builds the DOM. In authenticated mode this is a Firestore read per second per open tab. Don't add expensive work inside `renderAllEvents` without addressing this.

- **Google Charts globals.** `index.html` defines a top-level `drawChart()` and reads `window.timelineData`. `main.js` populates `window.timelineData` and calls `drawChart` via `setTimeout`. There's a separate, mostly-unused `EventsHtml.renderTimeline` path that also writes `window.timelineData` — `main.js` is the live path.

- **moment is a global.** `Event.js` uses `moment(...)` without importing it; it's loaded via the `<script>` tag in `index.html`. Don't try to `import moment` in module files.

- **Auth-state migration.** When the user signs in, `authService.onAuthStateChanged` triggers `storage.migrateCookiesToCloud()`, which copies cookie events into Firestore via `saveAllEvents` — i.e., it wipes any existing cloud events for that user first. The cookie is intentionally not cleared (see commented line in `migrateCookiesToCloud`).

## Firebase

Config lives in `js/firebase-config.js` and is committed (this is normal for client-side Firebase — security is enforced by Firestore rules, not by hiding the API key). The Firestore collection is `events`, scoped per user via a `userId` field equal to `auth.currentUser.uid`. There is no Firebase tooling in the repo (no `firebase.json`, no Functions, no emulator config) — security rules are managed in the Firebase Console for project `eventmanagerdavidtbilisi`.

## Files that look load-bearing but aren't

- `js/LocalStorage.js` and `js/FormHandler.js` — not imported anywhere; legacy from before the cookie/Firebase split. Don't wire new code into them without checking.
- `js/data.json` — sample data, not loaded by the app.
