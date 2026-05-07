// One-way pull from Google Calendar. Triggers a Google sign-in popup with the
// calendar.readonly scope, fetches events from the user's primary calendar in
// the requested window, and returns them in the app's storage shape.
//
// Setup required (one-time, in Google Cloud Console for the Firebase project):
//   1. Enable the Google Calendar API.
//   2. Add ".../auth/calendar.readonly" to the OAuth consent screen scopes.
// Until both are done the popup will fail with an OAuth error.
import { auth, GoogleAuthProvider, signInWithPopup } from "./firebase-config.js";

const pad = (n) => String(n).padStart(2, "0");

function toLocalIso(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normaliseStart(itemStart) {
    if (!itemStart) return null;
    if (itemStart.dateTime) return toLocalIso(new Date(itemStart.dateTime));
    if (itemStart.date) return `${itemStart.date}T00:00`;
    return null;
}

function normaliseEnd(itemEnd) {
    if (!itemEnd) return undefined;
    if (itemEnd.dateTime) return toLocalIso(new Date(itemEnd.dateTime));
    if (itemEnd.date) return `${itemEnd.date}T00:00`;
    return undefined;
}

export async function fetchGoogleCalendarEvents({ timeMin, timeMax } = {}) {
    const provider = new GoogleAuthProvider();
    provider.addScope("https://www.googleapis.com/auth/calendar.readonly");
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential && credential.accessToken;
    if (!accessToken) {
        throw new Error("Google did not return an access token. Make sure the Calendar API is enabled.");
    }

    const params = new URLSearchParams({
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
    });
    if (timeMin) params.set("timeMin", new Date(timeMin).toISOString());
    if (timeMax) params.set("timeMax", new Date(timeMax).toISOString());

    const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Google Calendar API ${res.status}: ${detail.slice(0, 200)}`);
    }
    const data = await res.json();

    return (data.items || [])
        .map((item) => {
            const start = normaliseStart(item.start);
            const end = normaliseEnd(item.end);
            if (!start) return null;
            return {
                title: item.summary || "(untitled)",
                start,
                end,
            };
        })
        .filter(Boolean);
}
