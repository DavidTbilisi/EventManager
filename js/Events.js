export class Event {
    constructor(name, date, endDate = null) {
        this.name = name;
        this.date = moment(date); // Store as moment object
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
}