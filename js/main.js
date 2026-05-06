import { EventsCountdown } from "./EventsCountdown.js";
import { Event } from "./Events.js";
import { EventsHtml } from "./EventsHtml.js";
import AuthService from "./AuthService.js";
import HybridStorage from "./HybridStorage.js";

const authService = new AuthService();
const storage = new HybridStorage(authService);

// ─── Theme ─────────────────────────────────────────────
const THEME_KEY = "chronicle-theme";
const THEME_LABELS = { auto: "Auto", light: "Light", dark: "Dark" };
const THEME_CYCLE = ["auto", "light", "dark"];
const darkMql = window.matchMedia("(prefers-color-scheme: dark)");

function getUserTheme() {
    try {
        const t = localStorage.getItem(THEME_KEY);
        return t === "light" || t === "dark" ? t : "auto";
    } catch (e) {
        return "auto";
    }
}

function setUserTheme(theme) {
    try {
        if (theme === "auto") localStorage.removeItem(THEME_KEY);
        else localStorage.setItem(THEME_KEY, theme);
    } catch (e) { /* ignore */ }
}

function applyTheme() {
    const user = getUserTheme();
    const effective = user === "auto" ? (darkMql.matches ? "dark" : "light") : user;
    document.documentElement.dataset.theme = effective;
    document.documentElement.dataset.userTheme = user;
    const toggle = document.getElementById("theme-toggle");
    if (toggle) {
        toggle.dataset.theme = user;
        const label = toggle.querySelector(".theme-label");
        if (label) label.textContent = THEME_LABELS[user];
    }
}

function cycleTheme() {
    const cur = getUserTheme();
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(cur) + 1) % THEME_CYCLE.length];
    setUserTheme(next);
    applyTheme();
}

document.getElementById("theme-toggle").addEventListener("click", cycleTheme);
darkMql.addEventListener("change", () => {
    if (getUserTheme() === "auto") applyTheme();
});
applyTheme();
// ───────────────────────────────────────────────────────


let cachedEvents = [];
let editingId = null;
let loadInFlight = false;
let loadPending = false;
let lastStorageType = null;

const form = document.getElementById("event-form");
const submitBtn = document.getElementById("event-submit");
const cancelBtn = document.getElementById("cancel-edit-btn");

function pad(n) {
    return String(n).padStart(2, "0");
}

// Format a stored datetime string back into the local-time string a
// <input type="datetime-local"> expects. Avoids the UTC shift caused by
// toISOString().
function toDateTimeLocalValue(value) {
    if (!value) return "";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toEventObj(formData) {
    return {
        title: formData.get("event-name"),
        start: formData.get("event-start-time"),
        end: formData.get("event-end-time") || undefined,
    };
}

function validateEvent(ev) {
    if (!ev.title || !ev.start) return "Title and start time are required.";
    if (ev.end && new Date(ev.end) < new Date(ev.start)) {
        return "End time must be on or after the start time.";
    }
    return null;
}

function enterEditMode(ev) {
    editingId = ev.id;
    form["event-name"].value = ev.title;
    form["event-start-time"].value = toDateTimeLocalValue(ev.start);
    form["event-end-time"].value = ev.end ? toDateTimeLocalValue(ev.end) : "";
    submitBtn.value = "Save changes";
    cancelBtn.style.display = "inline";
}

function exitEditMode() {
    editingId = null;
    form.reset();
    submitBtn.value = "Add event";
    cancelBtn.style.display = "none";
}

cancelBtn.addEventListener("click", exitEditMode);

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const eventObj = toEventObj(new FormData(form));
    const error = validateEvent(eventObj);
    if (error) {
        alert(error);
        return;
    }

    if (editingId) {
        const id = editingId;
        editingId = null;
        await storage.updateEvent(id, eventObj);
    } else {
        await storage.saveEvent(eventObj);
    }
    exitEditMode();
    await loadEvents();
});

// Fetch from storage once, then render. Tick re-renders from cache.
async function loadEvents() {
    if (loadInFlight) {
        loadPending = true;
        return;
    }
    loadInFlight = true;
    try {
        const events = await storage.getEvents();
        events.sort((a, b) => new Date(a.start) - new Date(b.start));
        cachedEvents = events;
    } finally {
        loadInFlight = false;
    }
    render();
    updateStorageInfo();
    if (loadPending) {
        loadPending = false;
        loadEvents();
    }
}

function render() {
    const eventsCountdown = new EventsCountdown();
    cachedEvents.forEach((e) => {
        eventsCountdown.addEvent(new Event(e.title, e.start, e.end, e.id));
    });
    new EventsHtml(eventsCountdown).renderEvents();
    renderTimeline();
    addEventActions();
}

function renderTimeline() {
    const container = document.getElementById("timeline");
    if (!container) return;
    container.innerHTML = "";

    if (cachedEvents.length === 0) {
        const empty = document.createElement("p");
        empty.className = "timeline-empty";
        empty.textContent = "Nothing to plot.";
        container.appendChild(empty);
        return;
    }

    const items = cachedEvents
        .map((e) => {
            const start = new Date(e.start);
            const end = e.end
                ? new Date(e.end)
                : new Date(start.getTime() + 24 * 60 * 60 * 1000);
            if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
            return { title: e.title, start, end };
        })
        .filter(Boolean);

    if (items.length === 0) {
        const empty = document.createElement("p");
        empty.className = "timeline-empty";
        empty.textContent = "Nothing to plot.";
        container.appendChild(empty);
        return;
    }

    const now = Date.now();
    const minT = Math.min(now, ...items.map((i) => i.start.getTime()));
    const maxT = Math.max(now, ...items.map((i) => i.end.getTime()));
    const span = Math.max(maxT - minT, 1);

    const fmt = (t) => {
        const d = new Date(t);
        const m = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][d.getMonth()];
        return `${m} ${d.getFullYear()}`;
    };

    const axis = document.createElement("div");
    axis.className = "timeline-axis";
    const start = document.createElement("span");
    start.textContent = fmt(minT);
    const end = document.createElement("span");
    end.textContent = fmt(maxT);
    axis.appendChild(start);
    axis.appendChild(end);

    const nowMarker = document.createElement("span");
    nowMarker.className = "timeline-now";
    const nowPct = ((now - minT) / span) * 100;
    nowMarker.style.left = `${Math.max(0, Math.min(100, nowPct))}%`;
    axis.appendChild(nowMarker);
    container.appendChild(axis);

    const tracks = document.createElement("ul");
    tracks.className = "timeline-tracks";

    items.forEach((it) => {
        const isPast = it.end.getTime() < now;
        const li = document.createElement("li");
        li.className = "timeline-track";
        if (isPast) li.classList.add("is-past");

        const label = document.createElement("span");
        label.className = "timeline-label";
        label.textContent = it.title;
        li.appendChild(label);

        const wrap = document.createElement("div");
        wrap.className = "timeline-bar-wrap";

        const leftPct = ((it.start.getTime() - minT) / span) * 100;
        const widthPct = Math.max(((it.end.getTime() - it.start.getTime()) / span) * 100, 0.6);
        const bar = document.createElement("span");
        bar.className = "timeline-bar";
        bar.style.left = `${leftPct}%`;
        bar.style.width = `${widthPct}%`;
        wrap.appendChild(bar);

        const marker = document.createElement("span");
        marker.className = "timeline-marker";
        marker.style.left = `${nowPct}%`;
        wrap.appendChild(marker);

        li.appendChild(wrap);
        tracks.appendChild(li);
    });

    container.appendChild(tracks);
}

function addEventActions() {
    const eventList = document.getElementById("events");
    if (!eventList) return;
    Array.from(eventList.children).forEach((li, idx) => {
        const event = cachedEvents[idx];
        if (!event || !event.id) return;
        const slot = li.querySelector(".event-actions");
        if (!slot) return;

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.textContent = "Edit";
        editBtn.className = "event-action";
        editBtn.onclick = () => enterEditMode(event);
        slot.appendChild(editBtn);

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.textContent = "Discard";
        removeBtn.className = "event-action";
        removeBtn.onclick = async () => {
            if (editingId === event.id) exitEditMode();
            await storage.removeEvent(event.id);
            await loadEvents();
        };
        slot.appendChild(removeBtn);
    });
}

function updateStorageInfo() {
    const storageInfo = storage.getStorageInfo();
    if (storageInfo.type === lastStorageType) return; // no-op when unchanged
    lastStorageType = storageInfo.type;

    let infoEl = document.getElementById("storage-info");
    if (!infoEl) {
        infoEl = document.createElement("div");
        infoEl.id = "storage-info";
        infoEl.className = "storage-info";
        document
            .querySelector(".container")
            .insertBefore(infoEl, document.getElementById("event-form"));
    }
    infoEl.innerHTML = "";

    const status = document.createElement("div");
    if (storageInfo.type === "cloud") {
        status.className = "cloud-status";
        const label = document.createElement("strong");
        label.textContent = "☁️ Cloud Sync Active";
        status.appendChild(label);
        status.appendChild(document.createTextNode(` - ${storageInfo.description} `));
        const btn = document.createElement("button");
        btn.id = "sign-out-btn";
        btn.className = "small-btn";
        btn.textContent = "Sign Out";
        btn.onclick = async () => {
            await authService.signOut();
        };
        status.appendChild(btn);
    } else {
        status.className = "local-status";
        const label = document.createElement("strong");
        label.textContent = "💾 Local Storage";
        status.appendChild(label);
        status.appendChild(document.createTextNode(` - ${storageInfo.description} `));
        const btn = document.createElement("button");
        btn.id = "sign-in-btn";
        btn.className = "small-btn";
        btn.textContent = "Sign in for Cloud Sync";
        btn.onclick = async () => {
            try {
                await authService.signInWithGoogle();
                await storage.migrateCookiesToCloud();
                await loadEvents();
            } catch (error) {
                console.error("Sign in failed:", error);
                alert("Sign in failed. Please try again.");
            }
        };
        status.appendChild(btn);
    }
    infoEl.appendChild(status);
}

// Auth state changes only re-load events; migration is explicit (sign-in click).
authService.onAuthStateChanged(() => {
    lastStorageType = null; // force the info bar to re-render with new state
    loadEvents();
});

loadEvents();

// Tick re-renders from cache so countdowns advance every second
// without hitting Firestore.
setInterval(render, 1000);
