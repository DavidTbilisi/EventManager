import { describe, it, expect } from "vitest";
import {
    exportIcs,
    parseIcs,
    exportCsv,
    parseCsv,
    dedupeAgainst,
} from "../js/dataIO.js";

describe("dataIO — iCalendar", () => {
    it("exports a minimal valid VCALENDAR with a VEVENT per input", () => {
        const ics = exportIcs([
            { id: "a1", title: "Trip", start: "2025-12-07T14:30", end: "2025-12-09T10:00" },
        ]);
        expect(ics).toMatch(/^BEGIN:VCALENDAR/);
        expect(ics).toMatch(/END:VCALENDAR/);
        expect(ics).toMatch(/BEGIN:VEVENT/);
        expect(ics).toMatch(/SUMMARY:Trip/);
        // CRLF line endings per RFC 5545
        expect(ics.includes("\r\n")).toBe(true);
    });

    it("escapes commas, semicolons, backslashes, and newlines in SUMMARY", () => {
        const ics = exportIcs([
            { id: "a1", title: "A; B, C\\D\nE", start: "2025-12-07T14:30" },
        ]);
        expect(ics).toMatch(/SUMMARY:A\\; B\\, C\\\\D\\nE/);
    });

    it("parses a roundtripped event back to the same shape", () => {
        const original = [
            { id: "a1", title: "Trip", start: "2025-12-07T14:30", end: "2025-12-09T10:00" },
        ];
        const parsed = parseIcs(exportIcs(original));
        expect(parsed).toHaveLength(1);
        expect(parsed[0].title).toBe("Trip");
        expect(parsed[0].start).toBe("2025-12-07T14:30");
        expect(parsed[0].end).toBe("2025-12-09T10:00");
    });

    it("unescapes special characters on import", () => {
        const ics = [
            "BEGIN:VCALENDAR",
            "BEGIN:VEVENT",
            "SUMMARY:A\\; B\\, C\\\\D\\nE",
            "DTSTART:20251207T143000Z",
            "END:VEVENT",
            "END:VCALENDAR",
        ].join("\r\n");
        const parsed = parseIcs(ics);
        expect(parsed[0].title).toBe("A; B, C\\D\nE");
    });

    it("treats DATE-only DTSTART as midnight local", () => {
        const ics = [
            "BEGIN:VCALENDAR",
            "BEGIN:VEVENT",
            "SUMMARY:All-day",
            "DTSTART;VALUE=DATE:20260101",
            "DTEND;VALUE=DATE:20260102",
            "END:VEVENT",
            "END:VCALENDAR",
        ].join("\r\n");
        const parsed = parseIcs(ics);
        expect(parsed[0].title).toBe("All-day");
        expect(parsed[0].start).toBe("2026-01-01T00:00");
        expect(parsed[0].end).toBe("2026-01-02T00:00");
    });

    it("unfolds RFC 5545 continuation lines", () => {
        // RFC 5545 §3.1: a CRLF + single SP/HTAB introduces a continuation; the
        // CRLF AND the leading whitespace are stripped on unfold (no space is
        // re-inserted), so the original is split mid-token.
        const ics = [
            "BEGIN:VCALENDAR",
            "BEGIN:VEVENT",
            "SUMMARY:Long title that ",
            " spans two lines",
            "DTSTART:20251207T143000Z",
            "END:VEVENT",
            "END:VCALENDAR",
        ].join("\r\n");
        const parsed = parseIcs(ics);
        expect(parsed[0].title).toBe("Long title that spans two lines");
    });

    it("ignores VEVENTs without a parseable DTSTART", () => {
        const ics = [
            "BEGIN:VCALENDAR",
            "BEGIN:VEVENT",
            "SUMMARY:Bad",
            "DTSTART:not-a-date",
            "END:VEVENT",
            "END:VCALENDAR",
        ].join("\r\n");
        expect(parseIcs(ics)).toHaveLength(0);
    });

    it("returns an empty array for non-string input", () => {
        expect(parseIcs(null)).toEqual([]);
        expect(parseIcs(undefined)).toEqual([]);
    });

    it("emits an RRULE for recurring events", () => {
        const ics = exportIcs([
            { id: "a1", title: "Birthday", start: "1990-06-15T08:00", recurrence: "yearly" },
        ]);
        expect(ics).toMatch(/RRULE:FREQ=YEARLY/);
    });

    it("emits FREQ + UNTIL together when until is set", () => {
        const ics = exportIcs([
            { id: "a1", title: "Stand-up", start: "2025-01-06T09:00", recurrence: "weekly", until: "2025-12-31" },
        ]);
        expect(ics).toMatch(/RRULE:FREQ=WEEKLY;UNTIL=20251231T235959Z/);
    });

    it("round-trips recurrence + until through export/parse", () => {
        const original = [
            { id: "a1", title: "BDay", start: "1990-06-15T08:00", recurrence: "yearly", until: "2030-12-31" },
        ];
        const parsed = parseIcs(exportIcs(original));
        expect(parsed[0].recurrence).toBe("yearly");
        expect(parsed[0].until).toBe("2030-12-31");
    });

    it("parses an RRULE without UNTIL into recurrence only", () => {
        const ics = [
            "BEGIN:VCALENDAR",
            "BEGIN:VEVENT",
            "SUMMARY:Daily",
            "DTSTART:20260101T080000Z",
            "RRULE:FREQ=DAILY",
            "END:VEVENT",
            "END:VCALENDAR",
        ].join("\r\n");
        const parsed = parseIcs(ics);
        expect(parsed[0].recurrence).toBe("daily");
        expect(parsed[0].until).toBeUndefined();
    });

    it("ignores unknown FREQ values", () => {
        const ics = [
            "BEGIN:VCALENDAR",
            "BEGIN:VEVENT",
            "SUMMARY:X",
            "DTSTART:20260101T080000Z",
            "RRULE:FREQ=HOURLY",
            "END:VEVENT",
            "END:VCALENDAR",
        ].join("\r\n");
        const parsed = parseIcs(ics);
        expect(parsed[0].recurrence).toBeUndefined();
    });
});

describe("dataIO — CSV", () => {
    it("exports a header row plus one row per event", () => {
        const csv = exportCsv([
            { title: "A", start: "2025-12-07T14:30", end: "2025-12-09T10:00" },
            { title: "B", start: "2026-01-01T00:00" },
        ]);
        const lines = csv.trim().split("\r\n");
        expect(lines[0]).toBe("title,start,end,recurrence,until");
        expect(lines[1]).toBe("A,2025-12-07T14:30,2025-12-09T10:00,,");
        expect(lines[2]).toBe("B,2026-01-01T00:00,,,");
    });

    it("exports recurrence + until columns when set", () => {
        const csv = exportCsv([
            { title: "Birthday", start: "1990-06-15T08:00", recurrence: "yearly", until: "2030-12-31" },
        ]);
        const lines = csv.trim().split("\r\n");
        expect(lines[1]).toBe("Birthday,1990-06-15T08:00,,yearly,2030-12-31");
    });

    it("parses recurrence + until columns when present", () => {
        const csv = "title,start,end,recurrence,until\r\nBday,1990-06-15T08:00,,yearly,2030-12-31\r\n";
        const parsed = parseCsv(csv);
        expect(parsed[0].recurrence).toBe("yearly");
        expect(parsed[0].until).toBe("2030-12-31");
    });

    it("ignores invalid recurrence values from CSV", () => {
        const csv = "title,start,end,recurrence,until\r\nX,2025-01-01T00:00,,nonsense,\r\n";
        const parsed = parseCsv(csv);
        expect(parsed[0].recurrence).toBeUndefined();
    });

    it("quotes fields containing commas, quotes, or newlines", () => {
        const csv = exportCsv([
            { title: 'A, "B"\nC', start: "2025-12-07T14:30" },
        ]);
        expect(csv).toMatch(/"A, ""B""\nC"/);
    });

    it("roundtrips through parseCsv", () => {
        const original = [
            { title: 'Quote, "test"', start: "2025-12-07T14:30", end: "2025-12-09T10:00" },
            { title: "Plain", start: "2026-01-01T00:00", end: undefined },
        ];
        const parsed = parseCsv(exportCsv(original));
        expect(parsed).toHaveLength(2);
        expect(parsed[0].title).toBe('Quote, "test"');
        expect(parsed[0].start).toBe("2025-12-07T14:30");
        expect(parsed[0].end).toBe("2025-12-09T10:00");
        expect(parsed[1].end).toBeUndefined();
    });

    it("recognises columns case-insensitively and ignores extras", () => {
        const csv = "Title,Start,End,Notes\r\nA,2025-12-07T14:30,,Whatever\r\n";
        const parsed = parseCsv(csv);
        expect(parsed).toHaveLength(1);
        expect(parsed[0].title).toBe("A");
        expect(parsed[0].start).toBe("2025-12-07T14:30");
        expect(parsed[0].end).toBeUndefined();
    });

    it("skips rows without title or start", () => {
        const csv = "title,start,end\r\n,2025-12-07T14:30,\r\nA,,\r\nGood,2026-01-01T00:00,\r\n";
        const parsed = parseCsv(csv);
        expect(parsed).toHaveLength(1);
        expect(parsed[0].title).toBe("Good");
    });

    it("returns [] when title or start columns are absent", () => {
        expect(parseCsv("foo,bar\r\n1,2\r\n")).toEqual([]);
    });

    it("returns [] for empty input", () => {
        expect(parseCsv("")).toEqual([]);
        expect(parseCsv(null)).toEqual([]);
    });
});

describe("dataIO — dedupeAgainst", () => {
    it("skips events that already exist by title+start+end", () => {
        const existing = [
            { title: "A", start: "2025-12-07T14:30", end: "2025-12-09T10:00" },
        ];
        const incoming = [
            { title: "A", start: "2025-12-07T14:30", end: "2025-12-09T10:00" }, // dup
            { title: "A", start: "2025-12-07T14:30" }, // different end → not a dup
            { title: "B", start: "2025-12-07T14:30", end: "2025-12-09T10:00" }, // new
        ];
        const { added, skipped } = dedupeAgainst(existing, incoming);
        expect(skipped).toBe(1);
        expect(added).toHaveLength(2);
        expect(added.map((e) => e.title)).toEqual(["A", "B"]);
    });

    it("dedupes within the incoming batch as well", () => {
        const incoming = [
            { title: "X", start: "2025-12-07T14:30" },
            { title: "X", start: "2025-12-07T14:30" },
        ];
        const { added, skipped } = dedupeAgainst([], incoming);
        expect(added).toHaveLength(1);
        expect(skipped).toBe(1);
    });

    it("treats blank-string and undefined end as equivalent", () => {
        const existing = [{ title: "A", start: "2025-12-07T14:30" }];
        const incoming = [{ title: "A", start: "2025-12-07T14:30", end: "" }];
        const { added, skipped } = dedupeAgainst(existing, incoming);
        expect(skipped).toBe(1);
        expect(added).toHaveLength(0);
    });
});
