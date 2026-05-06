import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Event } from "../js/Events.js";

describe("Event", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // Pin "now" so countdown math is deterministic.
        vi.setSystemTime(new Date("2025-06-01T12:00:00Z"));
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("stores id, name, and dates", () => {
        const e = new Event("Wedding", "2025-06-15T15:00:00Z", "2025-06-15T22:00:00Z", "abc");
        expect(e.id).toBe("abc");
        expect(e.name).toBe("Wedding");
        expect(e.date.toISOString()).toBe("2025-06-15T15:00:00.000Z");
        expect(e.endDate.toISOString()).toBe("2025-06-15T22:00:00.000Z");
    });

    it("defaults endDate to start + 1 day when not given", () => {
        const e = new Event("X", "2025-06-15T15:00:00Z");
        expect(e.endDate.toISOString()).toBe("2025-06-16T15:00:00.000Z");
    });

    describe("getLeadCount", () => {
        it("returns days for events many days away", () => {
            // 2025-06-01 → 2025-09-21 = 112 days
            const e = new Event("X", "2025-09-21T12:00:00Z");
            e.updateDuration();
            const lead = e.getLeadCount();
            expect(lead.unit).toBe("days");
            expect(lead.value).toBe(112);
            expect(lead.isPast).toBe(false);
        });

        it("returns hours when less than a day away", () => {
            const e = new Event("X", "2025-06-01T20:00:00Z"); // 8h ahead
            const lead = e.getLeadCount();
            expect(lead.unit).toBe("hours");
            expect(lead.value).toBe(8);
            expect(lead.isPast).toBe(false);
        });

        it("returns minutes when less than an hour away", () => {
            const e = new Event("X", "2025-06-01T12:30:00Z"); // 30min ahead
            const lead = e.getLeadCount();
            expect(lead.unit).toBe("minutes");
            expect(lead.value).toBe(30);
        });

        it("returns seconds when imminent", () => {
            const e = new Event("X", "2025-06-01T12:00:42Z"); // 42s ahead
            const lead = e.getLeadCount();
            expect(lead.unit).toBe("seconds");
            expect(lead.value).toBe(42);
        });

        it("singularizes the unit when value is 1", () => {
            const e = new Event("X", "2025-06-02T12:00:00Z"); // 1 day
            expect(e.getLeadCount().unit).toBe("day");
        });

        it("flags past events", () => {
            const e = new Event("X", "2025-05-30T12:00:00Z"); // 2 days ago
            const lead = e.getLeadCount();
            expect(lead.isPast).toBe(true);
            expect(lead.unit).toBe("days");
            expect(lead.value).toBe(2);
        });
    });

    describe("getDurationLabel", () => {
        it("returns null when no explicit end was set", () => {
            const e = new Event("X", "2025-09-21T12:00:00Z");
            expect(e.getDurationLabel()).toBeNull();
            expect(e.hasExplicitEnd).toBe(false);
        });

        it("returns a humane label when end is set (hours)", () => {
            const e = new Event("X", "2025-09-21T13:00:00Z", "2025-09-21T20:00:00Z");
            expect(e.hasExplicitEnd).toBe(true);
            expect(e.getDurationLabel()).toBe("7 hours");
        });

        it("returns 'N days' for whole-day spans", () => {
            const e = new Event("X", "2025-06-01T00:00:00Z", "2025-06-04T00:00:00Z");
            expect(e.getDurationLabel()).toBe("3 days");
        });

        it("returns combined units for non-round spans", () => {
            const e = new Event("X", "2025-06-01T00:00:00Z", "2025-06-02T06:00:00Z");
            expect(e.getDurationLabel()).toBe("1 day 6 hours");
        });
    });

    describe("getDuration", () => {
        it("populates breakdown after updateDuration", () => {
            const e = new Event("X", "2025-09-21T12:00:00Z");
            e.updateDuration();
            const d = e.getDuration();
            expect(d.isPast).toBe(false);
            expect(typeof d.days).toBe("number");
            expect(typeof d.hours).toBe("number");
            expect(d.weekday).toBe("Sun"); // 2025-09-21 is a Sunday
            expect(d.monthName).toBe("Sep");
        });
    });
});
