export class EventsCountdown {
    constructor() {
        this.events = [];
    }

    addEvent(event) {
        this.events.push(event);
    }

    addEvents(events) {
        this.events = this.events.concat(events);
    }

    getEvents() {
        return this.events;
    }

    getEventByName(eventName) {
        return this.events.find(event => event.name === eventName);
    }

    updateDurations() {
        this.events.forEach(event => event.updateDuration());
    }

    prepareTimelineData() {
        return this.events.map(event => {
            const start = new Date(event.date.year(), event.date.month(), event.date.date());
            const end = new Date(event.endDate.year(), event.endDate.month(), event.endDate.date());
            return [event.name, start, end];
        });
    }
}