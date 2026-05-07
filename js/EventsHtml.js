export class EventsHtml {
    constructor(eventsCountdown, updateIn = null) {
        this.eventsCountdown = eventsCountdown;
        this.eventsList = document.getElementById("events");
        this.updateIn = updateIn;
    }

    renderEvents() {
        this.eventsCountdown.updateDurations();
        const events = this.eventsCountdown.getEvents();

        // Build everything off-DOM, then swap it in atomically so the list
        // never goes through a 0-height intermediate state — preserves scroll
        // and avoids flicker with many cards.
        const fragment = document.createDocumentFragment();

        if (events.length === 0) {
            const li = document.createElement("li");
            li.className = "event-empty";
            const h3 = document.createElement("h3");
            h3.textContent = "Nothing yet on the horizon.";
            const p = document.createElement("p");
            p.textContent = "Inscribe your first event above";
            li.appendChild(h3);
            li.appendChild(p);
            fragment.appendChild(li);
        } else {
            events.forEach((event) => fragment.appendChild(this.createEventHtml(event)));
        }

        this.eventsList.replaceChildren(fragment);
    }

    renderEvent(event) {
        this.eventsList.appendChild(this.createEventHtml(event));
    }

    createEventHtml(event) {
        const duration = event.getDuration();
        const lead = event.getLeadCount();
        const isPast = duration.isPast;

        const li = document.createElement("li");
        li.classList.add("event");
        if (isPast) li.classList.add("is-past");
        if (event.id) li.dataset.eventId = event.id;

        const article = document.createElement("article");
        article.className = "event-card";

        // Kicker — date metadata + inline status
        const kicker = document.createElement("p");
        kicker.className = "event-kicker";
        const kickerDate = document.createElement("span");
        kickerDate.className = "event-kicker-date";
        kickerDate.textContent = event.date
            .format("ddd · DD MMM · HH:mm")
            .toUpperCase();
        kicker.appendChild(kickerDate);
        const status = document.createElement("span");
        status.className = `event-status ${isPast ? "status-past" : "status-future"}`;
        status.textContent = isPast ? "Past" : "Upcoming";
        kicker.appendChild(status);
        if (event.recurrence) {
            const recur = document.createElement("span");
            recur.className = "event-recurrence";
            recur.title = `Repeats ${event.recurrence}`;
            const glyph = document.createElement("span");
            glyph.className = "event-recurrence-glyph";
            glyph.setAttribute("aria-hidden", "true");
            glyph.textContent = "↻";
            const label = document.createElement("span");
            label.className = "event-recurrence-label";
            label.textContent = event.recurrence;
            recur.appendChild(glyph);
            recur.appendChild(label);
            kicker.appendChild(recur);
        }
        article.appendChild(kicker);

        // Title
        const title = document.createElement("h3");
        title.className = "event-title";
        title.textContent = event.name;
        article.appendChild(title);

        // Hero countdown line
        const hero = document.createElement("div");
        hero.className = "event-hero";
        const heroValue = document.createElement("span");
        heroValue.className = "event-hero-value";
        heroValue.textContent = lead.value.toLocaleString();
        const heroUnit = document.createElement("span");
        heroUnit.className = "event-hero-unit";
        heroUnit.textContent = isPast
            ? `${lead.unit} ago`
            : `${lead.unit} remaining`;
        hero.appendChild(heroValue);
        hero.appendChild(heroUnit);
        article.appendChild(hero);

        // Compact inline breakdown — value + label, zeros dimmed
        const breakdown = document.createElement("dl");
        breakdown.className = "event-breakdown";
        const units = [
            ["Y", duration.years],
            ["M", duration.months],
            ["W", duration.weeks],
            ["D", duration.days],
            ["H", duration.hours],
            ["M", duration.minutes],
            ["S", duration.seconds],
        ];
        units.forEach(([label, value]) => {
            const cell = document.createElement("div");
            cell.className = "unit";
            if (value === 0) cell.classList.add("is-zero");
            const dd = document.createElement("dd");
            dd.textContent = String(value).padStart(2, "0");
            const dt = document.createElement("dt");
            dt.textContent = label;
            cell.appendChild(dd);
            cell.appendChild(dt);
            breakdown.appendChild(cell);
        });
        article.appendChild(breakdown);

        // Footer row — actions on the left, duration aside on the right.
        const foot = document.createElement("footer");
        foot.className = "event-foot";

        const actions = document.createElement("div");
        actions.className = "event-actions";
        foot.appendChild(actions);

        const durationLabel = event.getDurationLabel();
        if (durationLabel) {
            const dur = document.createElement("p");
            dur.className = "event-duration";
            dur.textContent = durationLabel;
            foot.appendChild(dur);
        }

        article.appendChild(foot);

        li.appendChild(article);
        return li;
    }

    startRendering() {
        this.renderEvents();
        if (this.updateIn) {
            setInterval(() => this.renderEvents(), this.updateIn);
        }
    }
}
