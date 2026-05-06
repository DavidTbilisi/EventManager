import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Event } from "../js/Events.js";
import { EventsCountdown } from "../js/EventsCountdown.js";
import { EventsHtml } from "../js/EventsHtml.js";

describe("EventsHtml", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2025-06-01T12:00:00Z"));
        document.body.innerHTML = `<ul id="events"></ul>`;
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    function render(events) {
        const countdown = new EventsCountdown();
        events.forEach((e) =>
            countdown.addEvent(new Event(e.title, e.start, e.end, e.id))
        );
        new EventsHtml(countdown).renderEvents();
        return document.getElementById("events");
    }

    it("renders an empty state when no events", () => {
        const list = render([]);
        expect(list.children.length).toBe(1);
        expect(list.textContent).toMatch(/Nothing yet/i);
    });

    it("renders a card with kicker, title, hero, breakdown, and action slot", () => {
        const list = render([
            { id: "id1", title: "Vacation", start: "2025-06-15T10:00:00Z" },
        ]);
        expect(list.children.length).toBe(1);
        const li = list.children[0];
        expect(li.dataset.eventId).toBe("id1");
        expect(li.querySelector(".event-kicker")).toBeTruthy();
        expect(li.querySelector(".event-title").textContent).toBe("Vacation");
        expect(li.querySelector(".event-hero-value")).toBeTruthy();
        expect(li.querySelectorAll(".event-breakdown .unit").length).toBe(7);
        expect(li.querySelector(".event-actions")).toBeTruthy();
    });

    it("escapes user-supplied event titles (no XSS via innerHTML)", () => {
        const malicious = '<img src=x onerror="window.__pwned=1">';
        const list = render([
            { id: "id1", title: malicious, start: "2025-06-15T10:00:00Z" },
        ]);
        const title = list.querySelector(".event-title");
        // textContent stays as the literal string; no <img> element materializes.
        expect(title.textContent).toBe(malicious);
        expect(list.querySelector("img")).toBeNull();
        expect(window.__pwned).toBeUndefined();
    });

    it("marks past events with is-past and the Past status pill", () => {
        const list = render([
            { id: "id1", title: "Old", start: "2024-01-01T10:00:00Z" },
        ]);
        const li = list.children[0];
        expect(li.classList.contains("is-past")).toBe(true);
        const status = li.querySelector(".event-status");
        expect(status.textContent).toBe("Past");
        expect(status.classList.contains("status-past")).toBe(true);
    });

    it("marks upcoming events with the Upcoming status pill", () => {
        const list = render([
            { id: "id1", title: "Soon", start: "2026-01-01T10:00:00Z" },
        ]);
        const li = list.children[0];
        expect(li.classList.contains("is-past")).toBe(false);
        const status = li.querySelector(".event-status");
        expect(status.textContent).toBe("Upcoming");
        expect(status.classList.contains("status-future")).toBe(true);
    });

    it("dims units with a zero value", () => {
        // Event 30 minutes from now — years/months/weeks/days/hours/seconds = 0
        const list = render([
            { id: "id1", title: "Soon", start: "2025-06-01T12:30:00Z" },
        ]);
        const units = list.querySelectorAll(".event-breakdown .unit");
        // The first 5 cells (Y, M, W, D, H) should be zero/dim.
        for (let i = 0; i < 5; i++) {
            expect(units[i].classList.contains("is-zero")).toBe(true);
        }
        // The minutes cell should not be dim (value = 30).
        expect(units[5].classList.contains("is-zero")).toBe(false);
    });

    it("renders the duration in the footer when an explicit end is set", () => {
        const list = render([
            { id: "id1", title: "Vacation", start: "2025-06-15T10:00:00Z", end: "2025-06-18T10:00:00Z" },
        ]);
        const foot = list.querySelector(".event-foot");
        expect(foot).toBeTruthy();
        const dur = foot.querySelector(".event-duration");
        expect(dur).toBeTruthy();
        expect(dur.textContent).toBe("3 days");
    });

    it("omits the duration line when no end is set", () => {
        const list = render([
            { id: "id1", title: "Coffee", start: "2025-06-15T10:00:00Z" },
        ]);
        expect(list.querySelector(".event-duration")).toBeNull();
    });

    it("formats hero unit text with 'remaining' or 'ago' depending on direction", () => {
        const future = render([{ id: "f", title: "F", start: "2025-09-01T12:00:00Z" }]);
        expect(future.querySelector(".event-hero-unit").textContent).toMatch(/remaining/);

        document.body.innerHTML = `<ul id="events"></ul>`;
        const past = render([{ id: "p", title: "P", start: "2024-09-01T12:00:00Z" }]);
        expect(past.querySelector(".event-hero-unit").textContent).toMatch(/ago/);
    });
});
