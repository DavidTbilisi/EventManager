export class EventsHtml {
    constructor(eventsCountdown) {
        this.eventsCountdown = eventsCountdown;
        this.eventsList = document.getElementById("events");
    }

    renderEvents() {
        this.eventsList.innerHTML = ''; // Clear the previous content
        this.eventsCountdown.updateDurations();
        this.eventsCountdown.getEvents().forEach(event => {
            this.renderEvent(event);
        });
    }

    renderEvent(event) {
        const eventHtml = this.createEventHtml(event);
        this.eventsList.appendChild(eventHtml);
    }

    createEventHtml(event) {
        const eventDuration = event.getDuration();
        const timeDirection = eventDuration.isPast ? "past" : "future";
        const eventHtml = document.createElement("li");
        eventHtml.classList.add("event");
        eventHtml.innerHTML = `
        <div class="countdown">
            <h2>${event.name}</h2>
            <div class="event-date">
                <div class="weekday">${eventDuration.weekday}</div>
                <div class="month-name">${eventDuration.monthName}</div>
                <div class="event-day">${event.date.format('D')}</div>
                <div class="event-year">${event.date.format('YYYY')}</div>
            </div>
            <div class="years">${eventDuration.years} years</div>
            <div class="months">${eventDuration.months} months</div>
            <div class="weeks">${eventDuration.weeks} weeks</div>
            <div class="days">${eventDuration.days} days</div>
            <div class="hours">${eventDuration.hours} hours</div>
            <div class="minutes">${eventDuration.minutes} minutes</div>
            <div class="seconds">${eventDuration.seconds} seconds</div>
            <div class="time-direction ${timeDirection}">${timeDirection}</div>
        </div>
        `;
        return eventHtml;
    }

    renderTimeline() {
        const timelineData = this.eventsCountdown.prepareTimelineData();
        window.timelineData = timelineData;
        google.charts.setOnLoadCallback(drawChart);
    }

    startRendering() {
        this.renderEvents();
        this.renderTimeline(); 
        // setInterval(() => this.renderEvents(), 1000); // Update every second
    }
}