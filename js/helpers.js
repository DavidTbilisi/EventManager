export function pad(n) {
    return String(n).padStart(2, "0");
}

// Format a stored datetime string back into the local-time string a
// <input type="datetime-local"> expects. Returns "" for null/invalid.
export function toDateTimeLocalValue(value) {
    if (!value) return "";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Escape a value for use inside an attribute selector. CSS.escape is widely
// supported, but guard so module code stays usable where it isn't (jsdom).
export function cssEscape(value) {
    const str = String(value);
    return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(str) : str;
}

function plural(n, unit) {
    return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

// Format a duration in ms as a humane label: "30 minutes", "7 hours",
// "3 days", "1 day 6 hours". Returns "" for non-positive durations.
export function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return "";
    const totalSec = Math.round(ms / 1000);
    if (totalSec < 60) return plural(totalSec, "second");
    const totalMin = Math.round(totalSec / 60);
    if (totalMin < 60) return plural(totalMin, "minute");
    const totalHours = Math.floor(totalMin / 60);
    const remainMin = totalMin % 60;
    if (totalHours < 24) {
        if (remainMin === 0) return plural(totalHours, "hour");
        return `${plural(totalHours, "hour")} ${plural(remainMin, "minute")}`;
    }
    const totalDays = Math.floor(totalHours / 24);
    const remainHours = totalHours % 24;
    if (remainHours === 0) return plural(totalDays, "day");
    return `${plural(totalDays, "day")} ${plural(remainHours, "hour")}`;
}

// Returns null when the event is valid; otherwise a user-facing error string.
export function validateEvent(ev) {
    if (!ev || !ev.title || !ev.start) return "Title and start time are required.";
    if (ev.end && new Date(ev.end) < new Date(ev.start)) {
        return "End time must be on or after the start time.";
    }
    if (ev.until) {
        // `until` is a date-only string; compare against start's date portion.
        const untilEnd = new Date(`${ev.until}T23:59:59`);
        if (isNaN(untilEnd.getTime())) return "Until date is invalid.";
        if (untilEnd < new Date(ev.start)) {
            return "Until date must be on or after the start date.";
        }
    }
    return null;
}
