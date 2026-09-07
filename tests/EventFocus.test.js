import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Event } from "../js/Events.js";
import { EventFocus } from "../js/EventFocus.js";

describe("EventFocus", () => {
    let focus;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2025-06-01T12:00:00Z"));
        document.body.innerHTML = `<ul id="events"></ul>`;
        document.body.className = "";
        focus = new EventFocus();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // Mirrors main.js#render: models are duration-updated before sync.
    function sync(events, stored = []) {
        const models = events.map(
            (e) => new Event(e.title, e.start, e.end, e.id, e.recurrence)
        );
        models.forEach((m) => m.updateDuration());
        focus.sync(models, stored);
        return models;
    }

    const SAMPLE = [
        { id: "a", title: "Launch", start: "2025-09-01T10:00:00Z" },
        { id: "b", title: "Retro", start: "2024-01-01T10:00:00Z" },
    ];

    it("stays closed until open() is called", () => {
        sync(SAMPLE);
        expect(focus.isOpen()).toBe(false);
        expect(document.getElementById("event-focus")).toBeNull();
    });

    it("opens a dialog overlay with the event's title and countdown", () => {
        sync(SAMPLE);
        focus.open("a");

        expect(focus.isOpen()).toBe(true);
        const root = document.getElementById("event-focus");
        expect(root.hidden).toBe(false);
        expect(root.getAttribute("role")).toBe("dialog");
        expect(root.getAttribute("aria-modal")).toBe("true");
        expect(root.querySelector(".focus-title").textContent).toBe("Launch");
        expect(root.querySelector(".focus-hero-unit").textContent).toMatch(/remaining/);
        expect(root.querySelectorAll(".focus-unit").length).toBe(7);
        expect(document.body.classList.contains("has-focus-view")).toBe(true);
    });

    it("ignores open() for an id that isn't in the current list", () => {
        sync(SAMPLE);
        focus.open("nope");
        expect(focus.isOpen()).toBe(false);
    });

    it("escapes user-supplied titles (no XSS via innerHTML)", () => {
        const malicious = '<img src=x onerror="window.__focusPwned=1">';
        sync([{ id: "x", title: malicious, start: "2025-09-01T10:00:00Z" }]);
        focus.open("x");
        const root = document.getElementById("event-focus");
        expect(root.querySelector(".focus-title").textContent).toBe(malicious);
        expect(root.querySelector("img")).toBeNull();
        expect(window.__focusPwned).toBeUndefined();
    });

    it("marks past events and flips the hero copy to 'ago'", () => {
        sync(SAMPLE);
        focus.open("b");
        const root = document.getElementById("event-focus");
        expect(root.classList.contains("is-past")).toBe(true);
        expect(root.querySelector(".focus-status").textContent).toBe("Past");
        expect(root.querySelector(".focus-hero-unit").textContent).toMatch(/ago/);
    });

    it("advances the countdown on sync without rebuilding the meta rows", () => {
        sync(SAMPLE);
        focus.open("a");
        const root = document.getElementById("event-focus");
        const metaBefore = root.querySelector(".focus-meta-row");

        vi.setSystemTime(new Date("2025-06-01T12:00:30Z"));
        const seconds = () => root.querySelectorAll(".focus-unit dd")[6].textContent;
        const before = seconds();
        sync(SAMPLE);
        expect(seconds()).not.toBe(before);
        // Same node — meta is only repainted when the event/occurrence changes.
        expect(root.querySelector(".focus-meta-row")).toBe(metaBefore);
    });

    it("closes itself when the focused event disappears from storage", () => {
        sync(SAMPLE);
        focus.open("a");
        sync([SAMPLE[1]]);
        expect(focus.isOpen()).toBe(false);
        expect(document.getElementById("event-focus").hidden).toBe(true);
        expect(document.body.classList.contains("has-focus-view")).toBe(false);
    });

    it("steps between events and wraps around", () => {
        sync(SAMPLE);
        focus.open("a");
        const title = () => document.querySelector(".focus-title").textContent;
        expect(title()).toBe("Launch");
        focus.step(1);
        expect(title()).toBe("Retro");
        focus.step(1);
        expect(title()).toBe("Launch");
        focus.step(-1);
        expect(title()).toBe("Retro");
    });

    it("hides navigation when there is only one event", () => {
        sync([SAMPLE[0]]);
        focus.open("a");
        const root = document.getElementById("event-focus");
        expect(root.querySelector(".focus-nav").hidden).toBe(true);
        expect(root.querySelector(".focus-count").hidden).toBe(true);
    });

    it("closes on Escape and navigates with the arrow keys", () => {
        sync(SAMPLE);
        focus.open("a");
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        expect(document.querySelector(".focus-title").textContent).toBe("Retro");
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        expect(focus.isOpen()).toBe(false);
    });

    it("stops listening for keys once closed", () => {
        sync(SAMPLE);
        focus.open("a");
        focus.close();
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        expect(focus.isOpen()).toBe(false);
        expect(document.querySelector(".focus-title").textContent).toBe("Launch");
    });

    it("shows end, duration, recurrence and until in the meta table", () => {
        const stored = [
            {
                id: "r",
                title: "Standup",
                start: "2025-05-01T09:00:00Z",
                end: "2025-05-01T09:30:00Z",
                recurrence: "daily",
                until: "2025-12-31",
            },
        ];
        // Display occurrence differs from the stored seed, as main.js computes it.
        sync(
            [{ ...stored[0], start: "2025-06-02T09:00:00Z", end: "2025-06-02T09:30:00Z" }],
            stored
        );
        focus.open("r");
        const meta = document.querySelector(".focus-meta").textContent;
        expect(meta).toMatch(/Begins/);
        expect(meta).toMatch(/Ends/);
        expect(meta).toMatch(/Lasts/);
        expect(meta).toMatch(/30 minutes/);
        expect(meta).toMatch(/Repeats/);
        expect(meta).toMatch(/Daily/);
        expect(meta).toMatch(/Until/);
        expect(meta).toMatch(/First entry/);
    });

    it("omits the end and duration rows when no explicit end is set", () => {
        sync([SAMPLE[0]]);
        focus.open("a");
        const meta = document.querySelector(".focus-meta").textContent;
        expect(meta).toMatch(/Begins/);
        expect(meta).not.toMatch(/Ends/);
        expect(meta).not.toMatch(/Lasts/);
    });

    it("routes Edit and Discard through the callbacks with the event id", () => {
        const onEdit = vi.fn();
        const onRemove = vi.fn();
        focus = new EventFocus({ onEdit, onRemove });

        sync(SAMPLE);
        focus.open("a");
        document.querySelector(".focus-action").click();
        expect(onEdit).toHaveBeenCalledWith("a");
        expect(focus.isOpen()).toBe(false);

        focus.open("b");
        document.querySelector(".focus-action-remove").click();
        expect(onRemove).toHaveBeenCalledWith("b");
        expect(focus.isOpen()).toBe(false);
    });

    it("closes on a backdrop click but not on a click inside the frame", () => {
        sync(SAMPLE);
        focus.open("a");
        const root = document.getElementById("event-focus");
        root.querySelector(".focus-frame").click();
        expect(focus.isOpen()).toBe(true);
        root.click();
        expect(focus.isOpen()).toBe(false);
    });

    it("hides the native fullscreen button where the API is unavailable", () => {
        sync(SAMPLE);
        focus.open("a");
        const btn = document.querySelector(".focus-screen");
        // jsdom has no requestFullscreen; the button should not be offered.
        expect(btn.hidden).toBe(typeof document.getElementById("event-focus").requestFullscreen !== "function");
    });
});
