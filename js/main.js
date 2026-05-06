import { EventsCountdown } from "./EventsCountdown.js";
import { Event } from "./Events.js";
import { EventsHtml } from "./EventsHtml.js";
import AuthService from "./AuthService.js";
import HybridStorage from "./HybridStorage.js";
import { toDateTimeLocalValue, validateEvent } from "./helpers.js";
import {
    THEME_LABELS,
    getUserTheme,
    setUserTheme,
    nextTheme,
    effectiveTheme,
} from "./theme.js";

const authService = new AuthService();
const storage = new HybridStorage(authService);

// ─── Theme ─────────────────────────────────────────────
const darkMql = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme() {
    const user = getUserTheme();
    const effective = effectiveTheme(user, darkMql.matches);
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
    setUserTheme(nextTheme(getUserTheme()));
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

function toEventObj(formData) {
    return {
        title: formData.get("event-name"),
        start: formData.get("event-start-time"),
        end: formData.get("event-end-time") || undefined,
    };
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

// Tick render — rebuilds event cards and the stats panel from cache so
// countdowns and the NEXT/LAST tiles advance every second without hitting
// storage.
function render() {
    const eventsCountdown = new EventsCountdown();
    cachedEvents.forEach((e) => {
        eventsCountdown.addEvent(new Event(e.title, e.start, e.end, e.id));
    });
    new EventsHtml(eventsCountdown).renderEvents();
    addEventActions();
    renderStatistics();
}

function renderStatistics() {
    const container = document.getElementById("stats");
    if (!container) return;
    container.innerHTML = "";

    if (cachedEvents.length === 0) {
        const empty = document.createElement("p");
        empty.className = "stats-empty";
        empty.textContent = "Nothing to count.";
        container.appendChild(empty);
        return;
    }

    const now = Date.now();
    const items = cachedEvents
        .map((e) => {
            const start = new Date(e.start).getTime();
            const end = e.end ? new Date(e.end).getTime() : start;
            if (isNaN(start) || isNaN(end)) return null;
            return { title: e.title, start, end };
        })
        .filter(Boolean);

    const past = items.filter((i) => i.end < now);
    const ahead = items.filter((i) => i.end >= now);

    const nextItems = ahead
        .filter((i) => i.start > now)
        .sort((a, b) => a.start - b.start)
        .slice(0, 3);
    const lastItems = past.sort((a, b) => b.end - a.end).slice(0, 3);

    const tiles = document.createElement("dl");
    tiles.className = "stats-tiles";
    const tileData = [
        ["Total", String(items.length)],
        ["Past", String(past.length)],
        ["Ahead", String(ahead.length)],
        ["Next", nextItems[0] ? formatDuration(nextItems[0].start - now) : "—"],
    ];
    tileData.forEach(([label, value]) => {
        const tile = document.createElement("div");
        tile.className = "stats-tile";
        const dd = document.createElement("dd");
        dd.textContent = value;
        const dt = document.createElement("dt");
        dt.textContent = label;
        tile.appendChild(dd);
        tile.appendChild(dt);
        tiles.appendChild(tile);
    });
    container.appendChild(tiles);

    if (nextItems.length || lastItems.length) {
        const groups = document.createElement("div");
        groups.className = "stats-groups";
        if (nextItems.length) {
            groups.appendChild(buildStatGroup("To come", nextItems, (it) => moment(it.start).fromNow()));
        }
        if (lastItems.length) {
            groups.appendChild(buildStatGroup("Past", lastItems, (it) => moment(it.end).fromNow()));
        }
        container.appendChild(groups);
    }
}

function buildStatGroup(label, items, whenOf) {
    const group = document.createElement("div");
    group.className = "stats-group";
    const heading = document.createElement("h3");
    heading.className = "stats-group-label";
    heading.textContent = label;
    group.appendChild(heading);

    const list = document.createElement("ul");
    list.className = "stats-lines";
    items.forEach((it) => {
        const li = document.createElement("li");
        const name = document.createElement("span");
        name.className = "stats-line-title";
        name.textContent = it.title;
        const sep = document.createElement("span");
        sep.className = "stats-line-sep";
        sep.textContent = "·";
        const when = document.createElement("span");
        when.className = "stats-line-when";
        when.textContent = whenOf(it);
        li.appendChild(name);
        li.appendChild(sep);
        li.appendChild(when);
        list.appendChild(li);
    });
    group.appendChild(list);
    return group;
}

function formatDuration(ms) {
    const abs = Math.abs(ms);
    const sec = Math.floor(abs / 1000);
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    const day = Math.floor(hr / 24);
    const wk = Math.floor(day / 7);
    const yr = Math.floor(day / 365);

    if (yr > 0) return `${yr}Y ${day - yr * 365}D`;
    if (wk > 0) return `${wk}W ${day - wk * 7}D`;
    if (day > 0) return `${day}D ${hr - day * 24}H`;
    if (hr > 0) return `${hr}H ${min - hr * 60}M`;
    if (min > 0) return `${min}M ${sec - min * 60}S`;
    return `${sec}S`;
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
        label.textContent = "Cloud";
        status.appendChild(label);
        const name = storageInfo.user && storageInfo.user.name;
        if (name) {
            status.appendChild(document.createTextNode(` · ${name}`));
        }
        const btn = document.createElement("button");
        btn.id = "sign-out-btn";
        btn.className = "small-btn";
        btn.textContent = "Sign out";
        btn.onclick = async () => {
            await authService.signOut();
        };
        status.appendChild(btn);
    } else {
        status.className = "local-status";
        const label = document.createElement("strong");
        label.textContent = "Local";
        status.appendChild(label);
        status.appendChild(document.createTextNode(" · cookies"));
        const btn = document.createElement("button");
        btn.id = "sign-in-btn";
        btn.className = "small-btn";
        btn.textContent = "Sign in";
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
