import { formatDuration } from "./helpers.js";

export class Event {
    constructor(name, date, endDate = null, id = null, recurrence = null) {
        this.id = id;
        this.name = name;
        this.recurrence = recurrence && recurrence !== "none" ? recurrence : null;
        this.date = moment(date); // Store as moment object
        this.hasExplicitEnd = !!endDate;
        // If endDate is not provided, set it to the next day after the start date
        this.endDate = endDate ? moment(endDate) : moment(date).add(1, 'days');
        this.years = 0;
        this.months = 0;
        this.weeks = 0;
        this.days = 0;
        this.hours = 0;
        this.minutes = 0;   
        this.seconds = 0;
        this.isPast = false;
    }

    setDuration(duration, isPast) {
        this.years = Math.abs(Math.floor(duration.years()));
        this.months = Math.abs(Math.floor(duration.months()));
        this.weeks = Math.abs(Math.floor(duration.weeks()));
        this.days = Math.abs(Math.floor(duration.days() % 7)); // Remaining days after weeks
        this.hours = Math.abs(Math.floor(duration.hours()));
        this.minutes = Math.abs(Math.floor(duration.minutes()));
        this.seconds = Math.abs(Math.floor(duration.seconds()));
        this.isPast = isPast;
    }

    updateDuration() {
        const now = moment();
        const isPast = now.isAfter(this.date);
        const duration = moment.duration(isPast ? now.diff(this.date) : this.date.diff(now));
        this.setDuration(duration, isPast);
    }

    getDuration() {
        return {
            years: this.years,
            months: this.months,
            weeks: this.weeks,
            days: this.days,
            hours: this.hours,
            minutes: this.minutes,
            seconds: this.seconds,
            isPast: this.isPast,
            weekday: this.date.format('ddd'), // Get weekday name
            monthName: this.date.format('MMM') // Get month name
        };
    }

    // Humane label for the event's own duration (start → end).
    // Returns null when no explicit end was set.
    getDurationLabel() {
        if (!this.hasExplicitEnd) return null;
        const ms = this.endDate.diff(this.date);
        return formatDuration(ms);
    }

    // Returns the dominant unit for the hero countdown line
    // (e.g. "142 days remaining" / "5 hours ago").
    getLeadCount() {
        const now = moment();
        const isPast = now.isAfter(this.date);
        const dur = moment.duration(isPast ? now.diff(this.date) : this.date.diff(now));
        const totalSec = Math.abs(dur.asSeconds());
        if (totalSec < 60) return { value: Math.floor(totalSec), unit: totalSec === 1 ? 'second' : 'seconds', isPast };
        if (totalSec < 3600) {
            const v = Math.floor(totalSec / 60);
            return { value: v, unit: v === 1 ? 'minute' : 'minutes', isPast };
        }
        if (totalSec < 86400) {
            const v = Math.floor(totalSec / 3600);
            return { value: v, unit: v === 1 ? 'hour' : 'hours', isPast };
        }
        const v = Math.floor(totalSec / 86400);
        return { value: v, unit: v === 1 ? 'day' : 'days', isPast };
    }
}