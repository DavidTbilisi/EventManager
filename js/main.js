
import { EventsCountdown } from "./EventsCountdown.js";
import { Event } from "./Events.js";
import { EventsHtml } from "./EventsHtml.js";

function fetchEvents(filename) {
    return fetch(filename)
        .then(response => response.json())
        .then(data => {
            let eventsCountdown = new EventsCountdown();

            data.forEach(eventData => {
                const event = new Event(eventData.title, eventData.start, eventData.end);
                eventsCountdown.addEvent(event);
            });

            eventsCountdown.sortByDate();

            return eventsCountdown;
        });
}

fetchEvents('./js/personal.json').then(eventsCountdown => {
    const eventsHtml = new EventsHtml(eventsCountdown, 30000);
    console.log(eventsHtml);
    eventsHtml.startRendering();
    eventsHtml.fullScreen("Kvariati trip");
});



// Example without fetch 
// const eventsCountdown = new EventsCountdown();
// eventsCountdown.addEvents([
//     new Event("Event 1", "2024-08-28"),
//     new Event("Event 2", "2024-09-10"),
//     new Event("Event 3", "2024-09-02", "2024-09-09"),
// ]);
// const eventsHtml = new EventsHtml(eventsCountdown);
// eventsHtml.startRendering();