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
import {
    exportIcs,
    exportCsv,
    parseIcs,
    parseCsv,
    dedupeAgainst,
} from "./dataIO.js";
import { fetchGoogleCalendarEvents } from "./calendar.js";
import { computeOccurrence, isRecurring, normalizeRecurrence } from "./recurrence.js";

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
const recurrenceSelect = document.getElementById("event-recurrence");
const untilField = document.getElementById("event-until-field");
const untilInput = document.getElementById("event-until");

function syncUntilVisibility() {
    const recurring = recurrenceSelect.value !== "none";
    untilField.hidden = !recurring;
    if (!recurring) untilInput.value = "";
}

recurrenceSelect.addEventListener("change", syncUntilVisibility);
syncUntilVisibility();

function toEventObj(formData) {
    const recurrence = normalizeRecurrence(formData.get("event-recurrence"));
    const until = recurrence !== "none" ? formData.get("event-until") || undefined : undefined;
    return {
        title: formData.get("event-name"),
        start: formData.get("event-start-time"),
        end: formData.get("event-end-time") || undefined,
        recurrence,
        until,
    };
}

function enterEditMode(ev) {
    editingId = ev.id;
    form["event-name"].value = ev.title;
    form["event-start-time"].value = toDateTimeLocalValue(ev.start);
    form["event-end-time"].value = ev.end ? toDateTimeLocalValue(ev.end) : "";
    recurrenceSelect.value = normalizeRecurrence(ev.recurrence);
    untilInput.value = ev.until || "";
    syncUntilVisibility();
    submitBtn.value = "Save changes";
    cancelBtn.style.display = "inline";
}

function exitEditMode() {
    editingId = null;
    form.reset();
    syncUntilVisibility();
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
        cachedEvents = await storage.getEvents();
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

// Per-tick view: resolve recurring events to their next occurrence so the
// chronicle, stats, and countdowns all use the same displayed dates.
let displayEvents = [];
function buildDisplayEvents() {
    const now = new Date();
    displayEvents = cachedEvents
        .map((e) => {
            const occ = computeOccurrence(e, now);
            return { ...e, start: occ.start, end: occ.end, _origStart: e.start };
        })
        .sort((a, b) => new Date(a.start) - new Date(b.start));
}

// Tick render — rebuilds event cards and the stats panel from cache so
// countdowns and the NEXT/LAST tiles advance every second without hitting
// storage.
function render() {
    buildDisplayEvents();
    const eventsCountdown = new EventsCountdown();
    displayEvents.forEach((e) => {
        eventsCountdown.addEvent(new Event(e.title, e.start, e.end, e.id, e.recurrence));
    });
    new EventsHtml(eventsCountdown).renderEvents();
    addEventActions();
    renderStatistics();
}

function renderStatistics() {
    const container = document.getElementById("stats");
    if (!container) return;
    container.innerHTML = "";

    if (displayEvents.length === 0) {
        const empty = document.createElement("p");
        empty.className = "stats-empty";
        empty.textContent = "Nothing to count.";
        container.appendChild(empty);
        return;
    }

    const now = Date.now();
    const items = displayEvents
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
        const display = displayEvents[idx];
        if (!display || !display.id) return;
        // Edit modal needs the original start/end, not the computed occurrence.
        const event = cachedEvents.find((e) => e.id === display.id) || display;
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

// ─── Archive (export / import / Google Calendar) ───────
const exportIcsBtn = document.getElementById("export-ics-btn");
const exportCsvBtn = document.getElementById("export-csv-btn");
const importBtn = document.getElementById("import-btn");
const importInput = document.getElementById("import-file");
const gcalBtn = document.getElementById("gcal-pull-btn");
const archiveStatus = document.getElementById("archive-status");

function setArchiveStatus(message, tone) {
    if (!archiveStatus) return;
    if (!message) {
        archiveStatus.hidden = true;
        archiveStatus.textContent = "";
        archiveStatus.className = "archive-status";
        return;
    }
    archiveStatus.hidden = false;
    archiveStatus.textContent = message;
    archiveStatus.className = `archive-status${tone ? ` is-${tone}` : ""}`;
}

function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportFilename(ext) {
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    return `chronicle-${stamp}.${ext}`;
}

if (exportIcsBtn) {
    exportIcsBtn.addEventListener("click", () => {
        if (cachedEvents.length === 0) {
            setArchiveStatus("Nothing to export.", "warn");
            return;
        }
        downloadFile(exportFilename("ics"), exportIcs(cachedEvents), "text/calendar");
        setArchiveStatus(`Exported ${cachedEvents.length} event${cachedEvents.length === 1 ? "" : "s"} as .ics.`, "ok");
    });
}

if (exportCsvBtn) {
    exportCsvBtn.addEventListener("click", () => {
        if (cachedEvents.length === 0) {
            setArchiveStatus("Nothing to export.", "warn");
            return;
        }
        downloadFile(exportFilename("csv"), exportCsv(cachedEvents), "text/csv");
        setArchiveStatus(`Exported ${cachedEvents.length} event${cachedEvents.length === 1 ? "" : "s"} as .csv.`, "ok");
    });
}

if (importBtn && importInput) {
    importBtn.addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", async () => {
        const file = importInput.files && importInput.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const ext = (file.name.split(".").pop() || "").toLowerCase();
            const parsed = ext === "csv" ? parseCsv(text) : parseIcs(text);
            await mergeImported(parsed, file.name);
        } catch (err) {
            console.error("Import failed:", err);
            setArchiveStatus(`Import failed: ${err.message}`, "warn");
        } finally {
            importInput.value = "";
        }
    });
}

if (gcalBtn) {
    gcalBtn.addEventListener("click", async () => {
        gcalBtn.disabled = true;
        setArchiveStatus("Opening Google sign-in…");
        try {
            const now = Date.now();
            const sixMonthsBack = new Date(now - 1000 * 60 * 60 * 24 * 180);
            const oneYearAhead = new Date(now + 1000 * 60 * 60 * 24 * 365);
            const events = await fetchGoogleCalendarEvents({
                timeMin: sixMonthsBack,
                timeMax: oneYearAhead,
            });
            await mergeImported(events, "Google Calendar");
        } catch (err) {
            console.error("Google Calendar pull failed:", err);
            setArchiveStatus(`Google Calendar: ${err.message}`, "warn");
        } finally {
            gcalBtn.disabled = false;
        }
    });
}

async function mergeImported(parsed, sourceLabel) {
    if (!parsed.length) {
        setArchiveStatus(`${sourceLabel}: no events found.`, "warn");
        return;
    }
    const { added, skipped } = dedupeAgainst(cachedEvents, parsed);
    if (added.length === 0) {
        setArchiveStatus(`${sourceLabel}: ${skipped} duplicate${skipped === 1 ? "" : "s"}, nothing new.`, "warn");
        return;
    }
    setArchiveStatus(`${sourceLabel}: importing ${added.length}…`);
    for (const ev of added) {
        await storage.saveEvent(ev);
    }
    await loadEvents();
    const parts = [`Imported ${added.length} from ${sourceLabel}`];
    if (skipped) parts.push(`${skipped} duplicate${skipped === 1 ? "" : "s"} skipped`);
    setArchiveStatus(`${parts.join(" · ")}.`, "ok");
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
