export class EventsHtml {
    constructor(eventsCountdown, updateIn = null) {
        this.eventsCountdown = eventsCountdown;
        this.eventsList = document.getElementById("events");
        this.updateIn = updateIn;
    }

    renderEvents() {
        this.eventsList.innerHTML = "";
        this.eventsCountdown.updateDurations();
        const events = this.eventsCountdown.getEvents();

        if (events.length === 0) {
            const li = document.createElement("li");
            const h3 = document.createElement("h3");
            h3.textContent = "Nothing yet on the horizon.";
            const p = document.createElement("p");
            p.textContent = "Inscribe your first event above";
            li.appendChild(h3);
            li.appendChild(p);
            this.eventsList.appendChild(li);
            return;
        }

        events.forEach((event) => this.renderEvent(event));
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

        // Header — kicker date + status
        const header = document.createElement("header");
        header.className = "event-header";
        const kicker = document.createElement("p");
        kicker.className = "event-kicker";
        kicker.textContent = event.date
            .format("ddd · DD MMM YYYY · HH:mm")
            .toUpperCase();
        const status = document.createElement("span");
        status.className = `event-status ${isPast ? "status-past" : "status-future"}`;
        status.textContent = isPast ? "Past" : "Upcoming";
        header.appendChild(kicker);
        header.appendChild(status);
        article.appendChild(header);

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

        // Full breakdown — show all 7 units; dim zero leading values
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
            const dt = document.createElement("dt");
            dt.textContent = label;
            const dd = document.createElement("dd");
            dd.textContent = String(value).padStart(2, "0");
            cell.appendChild(dt);
            cell.appendChild(dd);
            breakdown.appendChild(cell);
        });
        article.appendChild(breakdown);

        // Action slot — main.js fills this with Edit / Remove buttons
        const actions = document.createElement("footer");
        actions.className = "event-actions";
        article.appendChild(actions);

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
