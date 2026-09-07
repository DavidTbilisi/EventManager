import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pad, cssEscape, toDateTimeLocalValue, validateEvent, formatDuration } from "../js/helpers.js";

describe("pad", () => {
    it("zero-pads single digits to two characters", () => {
        expect(pad(0)).toBe("00");
        expect(pad(5)).toBe("05");
        expect(pad(12)).toBe("12");
    });
});

describe("toDateTimeLocalValue", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // Force a fixed timezone offset so the local-time calculation is deterministic.
        // We pin the system time, but timezone is whatever Node runs in. We assert
        // round-trip rather than literal output.
    });
    afterEach(() => vi.useRealTimers());

    it("returns '' for empty/invalid input", () => {
        expect(toDateTimeLocalValue("")).toBe("");
        expect(toDateTimeLocalValue(null)).toBe("");
        expect(toDateTimeLocalValue(undefined)).toBe("");
        expect(toDateTimeLocalValue("not-a-date")).toBe("");
    });

    it("round-trips a datetime-local string without UTC drift", () => {
        // Critical: the original bug used toISOString().slice(0,16) which shifted by tz.
        // A datetime-local string ("2025-06-15T13:30") is parsed as local; the
        // formatter must produce the same local components back.
        const input = "2025-06-15T13:30";
        const output = toDateTimeLocalValue(input);
        expect(output).toBe("2025-06-15T13:30");
    });

    it("preserves an ISO datetime as the same local components it parses to", () => {
        const d = new Date("2025-06-15T13:30:00");
        // Construct the expected string from the same Date's local components,
        // which is exactly what the function should produce.
        const expected =
            d.getFullYear() +
            "-" +
            String(d.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(d.getDate()).padStart(2, "0") +
            "T" +
            String(d.getHours()).padStart(2, "0") +
            ":" +
            String(d.getMinutes()).padStart(2, "0");
        expect(toDateTimeLocalValue("2025-06-15T13:30:00")).toBe(expected);
    });
});

describe("validateEvent", () => {
    it("rejects when title is missing", () => {
        expect(validateEvent({ title: "", start: "2025-01-01T10:00" })).toMatch(/required/i);
    });

    it("rejects when start is missing", () => {
        expect(validateEvent({ title: "X", start: "" })).toMatch(/required/i);
    });

    it("rejects when end is before start", () => {
        expect(
            validateEvent({ title: "X", start: "2025-06-15T10:00", end: "2025-06-15T09:00" })
        ).toMatch(/on or after/i);
    });

    it("accepts when end equals start", () => {
        expect(
            validateEvent({ title: "X", start: "2025-06-15T10:00", end: "2025-06-15T10:00" })
        ).toBeNull();
    });

    it("accepts when end is missing", () => {
        expect(validateEvent({ title: "X", start: "2025-06-15T10:00" })).toBeNull();
    });

    it("accepts a properly ordered range", () => {
        expect(
            validateEvent({ title: "X", start: "2025-06-15T10:00", end: "2025-06-15T11:00" })
        ).toBeNull();
    });

    it("rejects null/undefined input", () => {
        expect(validateEvent(null)).toMatch(/required/i);
        expect(validateEvent(undefined)).toMatch(/required/i);
    });
});

describe("formatDuration", () => {
    const sec = 1000;
    const min = 60 * sec;
    const hr = 60 * min;
    const day = 24 * hr;

    it("returns '' for zero/negative/invalid", () => {
        expect(formatDuration(0)).toBe("");
        expect(formatDuration(-1)).toBe("");
        expect(formatDuration(NaN)).toBe("");
        expect(formatDuration(undefined)).toBe("");
    });

    it("seconds", () => {
        expect(formatDuration(1 * sec)).toBe("1 second");
        expect(formatDuration(45 * sec)).toBe("45 seconds");
    });

    it("minutes", () => {
        expect(formatDuration(1 * min)).toBe("1 minute");
        expect(formatDuration(30 * min)).toBe("30 minutes");
        // Just under an hour rounds to "59 minutes" or below
        expect(formatDuration(59 * min)).toBe("59 minutes");
    });

    it("whole hours", () => {
        expect(formatDuration(1 * hr)).toBe("1 hour");
        expect(formatDuration(7 * hr)).toBe("7 hours");
    });

    it("hours + minutes", () => {
        expect(formatDuration(2 * hr + 30 * min)).toBe("2 hours 30 minutes");
        expect(formatDuration(1 * hr + 1 * min)).toBe("1 hour 1 minute");
    });

    it("whole days", () => {
        expect(formatDuration(1 * day)).toBe("1 day");
        expect(formatDuration(3 * day)).toBe("3 days");
    });

    it("days + hours", () => {
        expect(formatDuration(1 * day + 6 * hr)).toBe("1 day 6 hours");
        expect(formatDuration(2 * day + 1 * hr)).toBe("2 days 1 hour");
    });
});

describe("cssEscape", () => {
    afterEach(() => {
        delete globalThis.CSS;
    });

    it("delegates to CSS.escape when the browser provides it", () => {
        globalThis.CSS = { escape: vi.fn((s) => `esc(${s})`) };
        expect(cssEscape('a"b')).toBe('esc(a"b)');
        expect(globalThis.CSS.escape).toHaveBeenCalledWith('a"b');
    });

    it("falls back to the plain string where CSS.escape is missing", () => {
        // jsdom exposes no CSS global; the guard keeps module code usable there.
        expect(cssEscape("plain-id")).toBe("plain-id");
        expect(cssEscape(42)).toBe("42");
    });
});
