// Import / export between the app's storage shape ({title, start, end}) and
// iCalendar (.ics) / CSV. Storage uses the same string format the
// <input type="datetime-local"> produces: "YYYY-MM-DDTHH:MM" in local time.

const pad = (n) => String(n).padStart(2, "0");

function toLocalIso(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// ─── iCalendar ─────────────────────────────────────────────────────────────

// Escape commas, semicolons, backslashes, and newlines per RFC 5545 §3.3.11.
function icsEscapeText(s) {
    return String(s)
        .replace(/\\/g, "\\\\")
        .replace(/\r\n|\r|\n/g, "\\n")
        .replace(/,/g, "\\,")
        .replace(/;/g, "\\;");
}

function icsUnescapeText(s) {
    let out = "";
    for (let i = 0; i < s.length; i++) {
        if (s[i] === "\\" && i + 1 < s.length) {
            const next = s[i + 1];
            if (next === "n" || next === "N") out += "\n";
            else out += next;
            i++;
        } else {
            out += s[i];
        }
    }
    return out;
}

function toIcsDateTime(value) {
    // Emit UTC so DST and TZ ambiguity don't bite. The input is the local-time
    // string "YYYY-MM-DDTHH:MM" produced by datetime-local; new Date() reads it
    // as local; toISOString() converts to UTC.
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

const RRULE_FREQ = {
    daily: "DAILY",
    weekly: "WEEKLY",
    monthly: "MONTHLY",
    yearly: "YEARLY",
};
const RRULE_FREQ_REVERSE = {
    DAILY: "daily",
    WEEKLY: "weekly",
    MONTHLY: "monthly",
    YEARLY: "yearly",
};

// Build "FREQ=YEARLY;UNTIL=20301231T235959Z" (or null if non-recurring).
function buildRrule(recurrence, until) {
    const freq = RRULE_FREQ[recurrence];
    if (!freq) return null;
    const parts = [`FREQ=${freq}`];
    if (until) {
        // `until` is a date-only string. RFC 5545: UNTIL must be in UTC when
        // DTSTART has a time. Use end-of-day UTC for inclusivity.
        const u = new Date(`${until}T23:59:59Z`);
        if (!isNaN(u.getTime())) {
            parts.push(`UNTIL=${u.getUTCFullYear()}${pad(u.getUTCMonth() + 1)}${pad(u.getUTCDate())}T${pad(u.getUTCHours())}${pad(u.getUTCMinutes())}${pad(u.getUTCSeconds())}Z`);
        }
    }
    return parts.join(";");
}

// Parse "FREQ=YEARLY;UNTIL=..." into { recurrence, until }.
function parseRrule(value) {
    if (!value) return null;
    const out = {};
    for (const pair of value.split(";")) {
        const [k, v] = pair.split("=");
        if (!k || !v) continue;
        const key = k.trim().toUpperCase();
        if (key === "FREQ") {
            const r = RRULE_FREQ_REVERSE[v.trim().toUpperCase()];
            if (r) out.recurrence = r;
        } else if (key === "UNTIL") {
            // UNTIL is UTC per RFC 5545 when DTSTART is date-time. We emit
            // end-of-day UTC; take the UTC calendar date back so the
            // round-tripped `until` doesn't shift in non-UTC timezones.
            const utc = /^(\d{4})(\d{2})(\d{2})(?:T\d{2}\d{2}\d{2}Z)?$/.exec(v.trim());
            if (utc) {
                const [, y, mo, d] = utc;
                out.until = `${y}-${mo}-${d}`;
            }
        }
    }
    return out.recurrence ? out : null;
}

// Parse the ICS DTSTART / DTEND value into the local-time storage string.
// Accepts:
//   20251207T143000Z       (UTC)
//   20251207T143000        (floating local)
//   20251207               (date only — treat as midnight local)
function parseIcsDateTime(raw) {
    if (!raw) return null;
    const s = raw.trim();
    const utcMatch = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s);
    if (utcMatch) {
        const [, y, mo, d, h, mi, se] = utcMatch;
        const dt = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +se));
        return toLocalIso(dt);
    }
    const localMatch = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(s);
    if (localMatch) {
        const [, y, mo, d, h, mi] = localMatch;
        return `${y}-${mo}-${d}T${h}:${mi}`;
    }
    const dateMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
    if (dateMatch) {
        const [, y, mo, d] = dateMatch;
        return `${y}-${mo}-${d}T00:00`;
    }
    return null;
}

export function exportIcs(events) {
    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Chronicle//EN",
        "CALSCALE:GREGORIAN",
    ];
    const stamp = toIcsDateTime(toLocalIso(new Date())) || "19700101T000000Z";
    events.forEach((e, idx) => {
        const dtStart = toIcsDateTime(e.start);
        if (!dtStart) return;
        const dtEnd = e.end ? toIcsDateTime(e.end) : null;
        lines.push("BEGIN:VEVENT");
        lines.push(`UID:${e.id || `chronicle-${idx}-${Date.now()}`}@chronicle`);
        lines.push(`DTSTAMP:${stamp}`);
        lines.push(`SUMMARY:${icsEscapeText(e.title || "")}`);
        lines.push(`DTSTART:${dtStart}`);
        if (dtEnd) lines.push(`DTEND:${dtEnd}`);
        const rrule = buildRrule(e.recurrence, e.until);
        if (rrule) lines.push(`RRULE:${rrule}`);
        lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n") + "\r\n";
}

export function parseIcs(text) {
    if (typeof text !== "string") return [];
    // Unfold continuation lines (RFC 5545 §3.1): a CRLF followed by space/tab
    // is a continuation of the previous line.
    const unfolded = text.replace(/\r?\n[ \t]/g, "");
    const lines = unfolded.split(/\r?\n/);
    const events = [];
    let cur = null;
    for (const line of lines) {
        if (line === "BEGIN:VEVENT") {
            cur = {};
            continue;
        }
        if (line === "END:VEVENT") {
            if (cur && cur.start) {
                const ev = {
                    title: cur.title || "(untitled)",
                    start: cur.start,
                    end: cur.end || undefined,
                };
                if (cur.recurrence) ev.recurrence = cur.recurrence;
                if (cur.until) ev.until = cur.until;
                events.push(ev);
            }
            cur = null;
            continue;
        }
        if (!cur) continue;
        // Property lines are "NAME[;PARAMS]:VALUE". We only care about NAME and VALUE.
        const colon = line.indexOf(":");
        if (colon < 0) continue;
        const head = line.slice(0, colon);
        const value = line.slice(colon + 1);
        const name = head.split(";")[0].toUpperCase();
        if (name === "SUMMARY") cur.title = icsUnescapeText(value);
        else if (name === "DTSTART") cur.start = parseIcsDateTime(value);
        else if (name === "DTEND") cur.end = parseIcsDateTime(value);
        else if (name === "RRULE") {
            const rule = parseRrule(value);
            if (rule) {
                cur.recurrence = rule.recurrence;
                if (rule.until) cur.until = rule.until;
            }
        }
    }
    return events.filter((e) => e.start);
}

// ─── CSV ──────────────────────────────────────────────────────────────────

function csvEscape(field) {
    const s = field == null ? "" : String(field);
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

export function exportCsv(events) {
    const lines = ["title,start,end,recurrence,until"];
    events.forEach((e) => {
        const recurrence = e.recurrence && e.recurrence !== "none" ? e.recurrence : "";
        lines.push([
            csvEscape(e.title),
            csvEscape(e.start),
            csvEscape(e.end || ""),
            csvEscape(recurrence),
            csvEscape(e.until || ""),
        ].join(","));
    });
    return lines.join("\r\n") + "\r\n";
}

// Parse a CSV body with a header row. Recognises title/start/end columns
// case-insensitively; ignores extra columns. Handles RFC 4180 quoting.
export function parseCsv(text) {
    if (typeof text !== "string" || !text.trim()) return [];
    const rows = parseCsvRows(text);
    if (rows.length === 0) return [];
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const titleIdx = header.indexOf("title");
    const startIdx = header.indexOf("start");
    const endIdx = header.indexOf("end");
    const recurrenceIdx = header.indexOf("recurrence");
    const untilIdx = header.indexOf("until");
    if (titleIdx < 0 || startIdx < 0) return [];
    const out = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length === 1 && row[0] === "") continue;
        const title = (row[titleIdx] || "").trim();
        const start = (row[startIdx] || "").trim();
        const end = endIdx >= 0 ? (row[endIdx] || "").trim() : "";
        const recurrence = recurrenceIdx >= 0 ? (row[recurrenceIdx] || "").trim().toLowerCase() : "";
        const until = untilIdx >= 0 ? (row[untilIdx] || "").trim() : "";
        if (!title || !start) continue;
        const ev = { title, start, end: end || undefined };
        if (RRULE_FREQ[recurrence]) ev.recurrence = recurrence;
        if (ev.recurrence && until) ev.until = until;
        out.push(ev);
    }
    return out;
}

function parseCsvRows(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ",") {
                row.push(field);
                field = "";
            } else if (ch === "\n" || ch === "\r") {
                row.push(field);
                field = "";
                rows.push(row);
                row = [];
                if (ch === "\r" && text[i + 1] === "\n") i++;
            } else {
                field += ch;
            }
        }
    }
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}

// ─── Merge ────────────────────────────────────────────────────────────────

// Returns the imported events that are not already present in `existing`.
// Match key is title + start + end + recurrence + until (separator-delimited so "A1"+"2025" cannot collide with "A"+"12025").
export function dedupeAgainst(existing, incoming) {
    const key = (e) => `${e.title}${e.start}${e.end || ""}${e.recurrence || ""}${e.until || ""}`;
    const seen = new Set(existing.map(key));
    const added = [];
    let skipped = 0;
    for (const e of incoming) {
        const k = key(e);
        if (seen.has(k)) {
            skipped++;
            continue;
        }
        seen.add(k);
        added.push(e);
    }
    return { added, skipped };
}
