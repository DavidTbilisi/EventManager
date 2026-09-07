// Full-screen "focus" view for a single event.
//
// Owns one overlay element appended to <body>. main.js opens it by event id and
// calls sync() on every render tick, so the countdown in the overlay advances in
// step with the cards behind it. There are two levels of "full screen": the
// overlay always covers the viewport, and the screen button additionally asks
// the browser for native fullscreen (no-op where unsupported, e.g. jsdom).

import { recurrenceLabel } from "./recurrence.js";
import { cssEscape } from "./helpers.js";

// [display label, key on Event#getDuration()]
const UNITS = [
    ["Years", "years"],
    ["Months", "months"],
    ["Weeks", "weeks"],
    ["Days", "days"],
    ["Hours", "hours"],
    ["Minutes", "minutes"],
    ["Seconds", "seconds"],
];

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

export class EventFocus {
    // onEdit / onRemove receive the event id; main.js resolves it back to the
    // stored (seed) event so recurring edits show the original date.
    constructor({ onEdit, onRemove } = {}) {
        this.onEdit = onEdit || null;
        this.onRemove = onRemove || null;
        this.eventId = null;
        this.events = [];   // Event model instances, in display order
        this.stored = [];   // storage-shape events (for `until`, seed start)
        this.signature = null;
        this.root = null;
        this.els = {};
        this.onKeydown = this.onKeydown.bind(this);
        this.onFullscreenChange = this.onFullscreenChange.bind(this);
    }

    // ─── DOM ───────────────────────────────────────────

    build() {
        if (this.root) return this.root;

        const root = el("div", "event-focus");
        root.id = "event-focus";
        root.hidden = true;
        root.setAttribute("role", "dialog");
        root.setAttribute("aria-modal", "true");
        root.setAttribute("aria-labelledby", "event-focus-title");

        const frame = el("div", "focus-frame");

        // Top bar — kicker on the left, controls on the right.
        const top = el("header", "focus-top");
        const kicker = el("p", "focus-kicker");
        const controls = el("div", "focus-controls");

        const prev = el("button", "focus-nav", "←");
        prev.type = "button";
        prev.setAttribute("aria-label", "Previous event");
        const count = el("span", "focus-count");
        const next = el("button", "focus-nav", "→");
        next.type = "button";
        next.setAttribute("aria-label", "Next event");
        const screen = el("button", "focus-screen", "Full screen");
        screen.type = "button";
        const close = el("button", "focus-close", "Close");
        close.type = "button";
        close.setAttribute("aria-label", "Close");

        controls.append(prev, count, next, screen, close);
        top.append(kicker, controls);
        frame.appendChild(top);

        // Body — title, hero countdown, unit breakdown, meta table.
        const body = el("div", "focus-body");
        const title = el("h2", "focus-title");
        title.id = "event-focus-title";

        const hero = el("div", "focus-hero");
        const heroValue = el("span", "focus-hero-value");
        const heroUnit = el("span", "focus-hero-unit");
        hero.append(heroValue, heroUnit);

        const breakdown = el("dl", "focus-breakdown");
        const cells = UNITS.map(([label]) => {
            const cell = el("div", "focus-unit");
            const dd = el("dd", null, "00");
            const dt = el("dt", null, label);
            cell.append(dd, dt);
            breakdown.appendChild(cell);
            return { cell, dd };
        });

        const meta = el("dl", "focus-meta");
        body.append(title, hero, breakdown, meta);
        frame.appendChild(body);

        // Foot — the same actions the card offers.
        const foot = el("footer", "focus-foot");
        const edit = el("button", "focus-action", "Edit");
        edit.type = "button";
        const remove = el("button", "focus-action focus-action-remove", "Discard");
        remove.type = "button";
        foot.append(edit, remove);
        frame.appendChild(foot);

        root.appendChild(frame);
        document.body.appendChild(root);

        this.root = root;
        this.els = {
            frame, kicker, controls, prev, count, next, screen, close,
            title, heroValue, heroUnit, cells, meta, edit, remove,
        };

        // Backdrop click (outside the frame) closes.
        root.addEventListener("click", (e) => {
            if (e.target === root) this.close();
        });
        close.addEventListener("click", () => this.close());
        prev.addEventListener("click", () => this.step(-1));
        next.addEventListener("click", () => this.step(1));
        screen.addEventListener("click", () => this.toggleNativeFullscreen());
        edit.addEventListener("click", () => {
            const id = this.eventId;
            this.close();
            if (this.onEdit && id != null) this.onEdit(id);
        });
        remove.addEventListener("click", () => {
            const id = this.eventId;
            this.close();
            if (this.onRemove && id != null) this.onRemove(id);
        });

        screen.hidden = !this.supportsNativeFullscreen();
        document.addEventListener("fullscreenchange", this.onFullscreenChange);

        return root;
    }

    // ─── Open / close ──────────────────────────────────

    isOpen() {
        return this.eventId != null;
    }

    indexOf(id) {
        return this.events.findIndex((e) => e.id === id);
    }

    open(id) {
        if (this.indexOf(id) === -1) return;
        this.build();
        this.eventId = id;
        this.signature = null;
        this.root.hidden = false;
        document.body.classList.add("has-focus-view");
        document.addEventListener("keydown", this.onKeydown, true);
        this.paint(this.indexOf(id));
        this.els.close.focus();
    }

    close() {
        if (!this.isOpen()) return;
        const id = this.eventId;
        this.eventId = null;
        this.signature = null;
        if (this.root) this.root.hidden = true;
        document.body.classList.remove("has-focus-view");
        document.removeEventListener("keydown", this.onKeydown, true);
        this.exitNativeFullscreen();
        // Cards are rebuilt every tick, so look the trigger up fresh by id.
        const trigger = document.querySelector(
            `#events li[data-event-id="${cssEscape(id)}"] .event-open`
        );
        if (trigger) trigger.focus();
    }

    step(dir) {
        const idx = this.indexOf(this.eventId);
        if (idx === -1 || this.events.length === 0) return;
        const nextIdx = (idx + dir + this.events.length) % this.events.length;
        this.eventId = this.events[nextIdx].id;
        this.paint(nextIdx);
    }

    // ─── Per-tick sync ─────────────────────────────────

    sync(events, stored) {
        this.events = events || [];
        this.stored = stored || [];
        if (!this.isOpen()) return;
        const idx = this.indexOf(this.eventId);
        if (idx === -1) {
            this.close(); // the event was removed underneath us
            return;
        }
        this.paint(idx);
    }

    paint(idx) {
        const ev = this.events[idx];
        if (!ev || !this.root) return;

        const duration = ev.getDuration();
        const lead = ev.getLeadCount();
        const isPast = duration.isPast;

        this.root.classList.toggle("is-past", isPast);

        const many = this.events.length > 1;
        this.els.prev.hidden = !many;
        this.els.next.hidden = !many;
        this.els.count.hidden = !many;
        this.els.count.textContent = `${idx + 1} / ${this.events.length}`;

        this.els.title.textContent = ev.name;
        this.els.heroValue.textContent = lead.value.toLocaleString();
        this.els.heroUnit.textContent = isPast
            ? `${lead.unit} ago`
            : `${lead.unit} remaining`;

        this.els.cells.forEach(({ cell, dd }, i) => {
            const value = duration[UNITS[i][1]];
            dd.textContent = String(value).padStart(2, "0");
            cell.classList.toggle("is-zero", value === 0);
        });

        // Kicker and meta only change when the event (or its occurrence) does —
        // rebuilding them every second would fight text selection.
        const signature = `${ev.id}|${ev.date.valueOf()}|${ev.endDate.valueOf()}|${isPast}`;
        if (signature !== this.signature) {
            this.signature = signature;
            const stored = this.stored.find((s) => s.id === ev.id) || null;
            this.paintKicker(ev, isPast);
            this.paintMeta(ev, stored);
        }
    }

    paintKicker(ev, isPast) {
        const kicker = this.els.kicker;
        kicker.replaceChildren();
        kicker.appendChild(
            el("span", "focus-kicker-date", ev.date.format("dddd · DD MMM YYYY · HH:mm").toUpperCase())
        );
        kicker.appendChild(
            el(
                "span",
                `focus-status ${isPast ? "status-past" : "status-future"}`,
                isPast ? "Past" : "Upcoming"
            )
        );
        if (ev.recurrence) {
            kicker.appendChild(el("span", "focus-recur", `↻ ${ev.recurrence}`));
        }
    }

    paintMeta(ev, stored) {
        const rows = [["Begins", ev.date.format("ddd, D MMM YYYY · HH:mm")]];
        if (ev.hasExplicitEnd) {
            rows.push(["Ends", ev.endDate.format("ddd, D MMM YYYY · HH:mm")]);
        }
        const lasts = ev.getDurationLabel();
        if (lasts) rows.push(["Lasts", lasts]);
        if (ev.recurrence) {
            rows.push(["Repeats", recurrenceLabel(ev.recurrence) || ev.recurrence]);
            if (stored && stored.start) {
                rows.push(["First entry", moment(stored.start).format("ddd, D MMM YYYY · HH:mm")]);
            }
            if (stored && stored.until) {
                rows.push(["Until", moment(stored.until).format("ddd, D MMM YYYY")]);
            }
        }

        const meta = this.els.meta;
        meta.replaceChildren();
        rows.forEach(([label, value]) => {
            const row = el("div", "focus-meta-row");
            row.append(el("dt", null, label), el("dd", null, value));
            meta.appendChild(row);
        });
    }

    // ─── Keyboard ──────────────────────────────────────

    onKeydown(e) {
        if (!this.isOpen()) return;
        if (e.key === "Escape") {
            e.preventDefault();
            // In native fullscreen the first Escape should only leave fullscreen.
            if (this.isNativeFullscreen()) this.exitNativeFullscreen();
            else this.close();
        } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            this.step(-1);
        } else if (e.key === "ArrowRight") {
            e.preventDefault();
            this.step(1);
        } else if (e.key === "Tab") {
            this.trapTab(e);
        }
    }

    trapTab(e) {
        const focusable = Array.from(this.root.querySelectorAll("button:not([hidden])"));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }

    // ─── Native fullscreen ─────────────────────────────

    supportsNativeFullscreen() {
        return !!(this.root && typeof this.root.requestFullscreen === "function");
    }

    isNativeFullscreen() {
        return !!(this.root && document.fullscreenElement === this.root);
    }

    toggleNativeFullscreen() {
        if (!this.supportsNativeFullscreen()) return;
        if (this.isNativeFullscreen()) {
            this.exitNativeFullscreen();
            return;
        }
        Promise.resolve(this.root.requestFullscreen()).catch(() => {
            // Blocked by permissions policy (embedded frames, automated tabs).
            // The overlay already fills the viewport, so retire the dead control
            // rather than leaving a button that does nothing.
            this.els.screen.hidden = true;
        });
    }

    exitNativeFullscreen() {
        if (this.isNativeFullscreen() && typeof document.exitFullscreen === "function") {
            Promise.resolve(document.exitFullscreen()).catch(() => {});
        }
    }

    onFullscreenChange() {
        if (!this.els.screen) return;
        this.els.screen.textContent = this.isNativeFullscreen()
            ? "Exit full screen"
            : "Full screen";
        this.root.classList.toggle("is-native", this.isNativeFullscreen());
    }
}
