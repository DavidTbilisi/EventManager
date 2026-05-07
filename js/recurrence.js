// Recurrence math: advance a recurring event's start/end to the next
// occurrence relative to "now", bounded by an optional `until` date.
//
// Storage shape adds two optional fields:
//   recurrence: "none" | "daily" | "weekly" | "monthly" | "yearly"
//   until:      "YYYY-MM-DD" string or undefined
//
// Calendar arithmetic uses native Date setMonth/setFullYear, which means a
// monthly event seeded on the 31st will land on the 1st of the next month
// when there's no 31st (Feb, Apr, etc.). That's good enough — the alternative
// (RFC 5545 BYMONTHDAY semantics) is significantly more code than the rest of
// the feature warrants.

const FREQS = new Set(["none", "daily", "weekly", "monthly", "yearly"]);

const pad = (n) => String(n).padStart(2, "0");

function toLocalIsoMinute(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function isRecurring(event) {
    return !!event && FREQS.has(event.recurrence) && event.recurrence !== "none";
}

export function normalizeRecurrence(value) {
    return FREQS.has(value) ? value : "none";
}

// Add `n` recurrence steps to `from`. Returns a new Date.
export function addRecurrence(from, freq, n) {
    const d = new Date(from.getTime());
    if (n === 0) return d;
    switch (freq) {
        case "daily":
            d.setDate(d.getDate() + n);
            return d;
        case "weekly":
            d.setDate(d.getDate() + n * 7);
            return d;
        case "monthly":
            d.setMonth(d.getMonth() + n);
            return d;
        case "yearly":
            d.setFullYear(d.getFullYear() + n);
            return d;
        default:
            return d;
    }
}

// Returns the occurrence of `event` to display: { start, end } as local-time
// strings. Non-recurring events round-trip unchanged. Recurring events whose
// original start is in the past are advanced to the next occurrence > `now`.
// If `until` is set and the next future occurrence would exceed it, the most
// recent valid occurrence ≤ until is returned (so the event lands as "past").
export function computeOccurrence(event, now = new Date()) {
    if (!event) return event;
    const { start, end, recurrence, until } = event;
    if (!isRecurring(event) || !start) return { start, end };

    const startDate = new Date(start);
    if (isNaN(startDate.getTime())) return { start, end };
    if (startDate >= now) return { start, end };

    // Parse `until` as the END of that local day so an event scheduled for
    // 09:00 on the until date itself isn't excluded.
    let untilDate = null;
    if (until) {
        const u = new Date(`${until}T23:59:59`);
        if (!isNaN(u.getTime())) untilDate = u;
    }

    let next = startDate;
    let prev = startDate;
    for (let i = 1; i < 10000; i++) {
        const candidate = addRecurrence(startDate, recurrence, i);
        if (untilDate && candidate > untilDate) {
            // Recurrence has ended; surface the last valid occurrence as past.
            next = prev;
            break;
        }
        if (candidate > now) {
            next = candidate;
            break;
        }
        prev = candidate;
    }

    let nextEnd = end;
    if (end) {
        const endDate = new Date(end);
        if (!isNaN(endDate.getTime())) {
            const delta = next.getTime() - startDate.getTime();
            nextEnd = toLocalIsoMinute(new Date(endDate.getTime() + delta));
        }
    }

    return { start: toLocalIsoMinute(next), end: nextEnd };
}

const FREQ_LABEL = {
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    yearly: "Yearly",
};

export function recurrenceLabel(freq) {
    return FREQ_LABEL[freq] || "";
}
