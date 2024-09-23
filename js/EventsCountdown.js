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
        return this.events.find((event) => event.name === eventName);
    }

    updateDurations() {
        this.events.forEach((event) => event.updateDuration());
    }

    prepareTimelineData() {
        return this.events.map((event) => {
            const start = new Date(
                event.date.year(),
                event.date.month(),
                event.date.date()
            );
            const end = new Date(
                event.endDate.year(),
                event.endDate.month(),
                event.endDate.date()
            );
            return [event.name, start, end];
        });
    }

    sortByDate() {
        return this.events.sort((a, b) => a.date - b.date);
    }

    sortByDateDesc() {
        return this.events.sort((a, b) => b.date - a.date);
    }

    sortByDuration() {
        return this.events.sort((a, b) => a.date.diff(b.date));
    }

    sortByDurationDesc() {
        return this.events.sort((a, b) => b.date.diff(a.date));
    }

    filterByDate(date) {
        return this.events.filter((event) => event.date.isSame(date, "day"));
    }

    filterByMonth(month) {
        return this.events.filter((event) => event.date.isSame(month, "month"));
    }

    filterByYear(year) {
        return this.events.filter((event) => event.date.isSame(year, "year"));
    }

    filterByDuration(duration) {
        return this.events.filter((event) => event.duration.isSame(duration));
    }
}
