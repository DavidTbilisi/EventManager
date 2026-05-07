import { describe, it, expect } from "vitest";
import { computeOccurrence, addRecurrence, isRecurring, normalizeRecurrence } from "../js/recurrence.js";

describe("normalizeRecurrence", () => {
    it("accepts known frequencies", () => {
        ["none", "daily", "weekly", "monthly", "yearly"].forEach((f) => {
            expect(normalizeRecurrence(f)).toBe(f);
        });
    });
    it("falls back to 'none' for unknown values", () => {
        expect(normalizeRecurrence("hourly")).toBe("none");
        expect(normalizeRecurrence(undefined)).toBe("none");
        expect(normalizeRecurrence(null)).toBe("none");
    });
});

describe("isRecurring", () => {
    it("is false for none/missing", () => {
        expect(isRecurring({ recurrence: "none" })).toBe(false);
        expect(isRecurring({})).toBe(false);
        expect(isRecurring(null)).toBe(false);
    });
    it("is true for known frequencies", () => {
        expect(isRecurring({ recurrence: "yearly" })).toBe(true);
    });
});

describe("addRecurrence", () => {
    const base = new Date("2025-06-15T10:00:00");
    it("adds days", () => {
        expect(addRecurrence(base, "daily", 3).toISOString())
            .toBe(new Date("2025-06-18T10:00:00").toISOString());
    });
    it("adds weeks", () => {
        expect(addRecurrence(base, "weekly", 2).toISOString())
            .toBe(new Date("2025-06-29T10:00:00").toISOString());
    });
    it("adds months", () => {
        expect(addRecurrence(base, "monthly", 4).toISOString())
            .toBe(new Date("2025-10-15T10:00:00").toISOString());
    });
    it("adds years", () => {
        expect(addRecurrence(base, "yearly", 5).toISOString())
            .toBe(new Date("2030-06-15T10:00:00").toISOString());
    });
});

describe("computeOccurrence", () => {
    const now = new Date("2026-05-07T12:00:00");

    it("returns the original event when not recurring", () => {
        const ev = { start: "2020-01-01T10:00", end: "2020-01-01T11:00" };
        expect(computeOccurrence(ev, now)).toEqual({
            start: "2020-01-01T10:00",
            end: "2020-01-01T11:00",
        });
    });

    it("returns the original event when start is in the future", () => {
        const ev = { start: "2027-01-01T10:00", recurrence: "yearly" };
        const out = computeOccurrence(ev, now);
        expect(out.start).toBe("2027-01-01T10:00");
    });

    it("advances a yearly birthday to the next future occurrence", () => {
        // Birthday on June 15, 1990 — next from May 7, 2026 is June 15, 2026.
        const ev = { start: "1990-06-15T08:00", recurrence: "yearly" };
        const out = computeOccurrence(ev, now);
        expect(out.start).toBe("2026-06-15T08:00");
    });

    it("advances past today to next year if today's occurrence already passed", () => {
        const ev = { start: "1990-04-01T08:00", recurrence: "yearly" };
        const out = computeOccurrence(ev, now);
        expect(out.start).toBe("2027-04-01T08:00");
    });

    it("preserves the duration when advancing — end shifts by the same delta", () => {
        const ev = {
            start: "2020-06-15T10:00",
            end: "2020-06-15T12:00",
            recurrence: "yearly",
        };
        const out = computeOccurrence(ev, now);
        expect(out.start).toBe("2026-06-15T10:00");
        expect(out.end).toBe("2026-06-15T12:00");
    });

    it("advances weekly events to the next occurrence after now", () => {
        // 2026-05-04 is a Monday; weekly from there → 2026-05-11 is the next > 2026-05-07.
        const ev = { start: "2026-05-04T09:00", recurrence: "weekly" };
        const out = computeOccurrence(ev, now);
        expect(out.start).toBe("2026-05-11T09:00");
    });

    it("respects an `until` cap and surfaces the last past occurrence", () => {
        // Yearly birthday from 1990, capped at 2024 — next occurrence after 2026-05-07
        // would be 2027-06-15, but that exceeds until=2024-12-31, so the most
        // recent valid occurrence (2024-06-15) is returned, in the past.
        const ev = {
            start: "1990-06-15T08:00",
            recurrence: "yearly",
            until: "2024-12-31",
        };
        const out = computeOccurrence(ev, now);
        expect(out.start).toBe("2024-06-15T08:00");
    });

    it("treats `until` as end-of-day so the until-day itself is included", () => {
        const ev = {
            start: "2020-06-15T08:00",
            recurrence: "yearly",
            until: "2026-06-15",
        };
        const out = computeOccurrence(ev, now);
        // 2026-06-15 falls within 2026-06-15T23:59:59 so it's the next occurrence.
        expect(out.start).toBe("2026-06-15T08:00");
    });
});
