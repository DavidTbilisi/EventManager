import { EventsCountdown } from "./EventsCountdown.js";
import { Event } from "./Events.js";
import { EventsHtml } from "./EventsHtml.js";

// --- Cookie utility functions ---
function getEventsFromCookie() {
    const cookie = document.cookie.split('; ').find(row => row.startsWith('events='));
    if (cookie) {
        try {
            return JSON.parse(decodeURIComponent(cookie.split('=')[1]));
        } catch (e) {
            return [];
        }
    }
    return [];
}

function setEventsToCookie(events) {
    document.cookie = `events=${encodeURIComponent(JSON.stringify(events))}; path=/; max-age=31536000`;
}

function toEventObj(formData) {
    return {
        title: formData.get('event-name'),
        start: formData.get('event-start-time'),
        end: formData.get('event-end-time') || undefined
    };
}

// Edit event by index
function editEventInCookie(index, newEvent) {
    let events = getEventsFromCookie();
    if (index >= 0 && index < events.length) {
        events[index] = newEvent;
        setEventsToCookie(events);
        renderAllEvents();
    }
}

// Remove event by index
function removeEventFromCookie(index) {
    let events = getEventsFromCookie();
    if (index >= 0 && index < events.length) {
        events.splice(index, 1);
        setEventsToCookie(events);
        renderAllEvents();
    }
}

// Add edit/remove buttons to each event in the UI
function addEventActions() {
    const eventList = document.getElementById('events');
    if (!eventList) return;
    // Remove existing buttons to avoid duplicates
    eventList.querySelectorAll('.event-action').forEach(btn => btn.remove());
    // Add buttons to each event
    Array.from(eventList.children).forEach((li, idx) => {
        // Edit button
        const editBtn = document.createElement('button');
        editBtn.textContent = 'Edit';
        editBtn.className = 'event-action';
        editBtn.onclick = () => {
            const events = getEventsFromCookie();
            const event = events[idx];
            // Fill form with event data
            form['event-name'].value = event.title;
            form['event-start-time'].value = event.start;
            form['event-end-time'].value = event.end || '';
            // On next submit, replace event instead of adding
            form.onsubmit = function(e) {
                e.preventDefault();
                const formData = new FormData(form);
                const newEvent = toEventObj(formData);
                editEventInCookie(idx, newEvent);
                form.reset();
                form.onsubmit = defaultFormHandler;
            };
        };
        li.appendChild(editBtn);
        // Remove button
        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Remove';
        removeBtn.className = 'event-action';
        removeBtn.onclick = () => removeEventFromCookie(idx);
        li.appendChild(removeBtn);
    });
}

// Save default form handler for restoring after edit
const defaultFormHandler = function (e) {
    e.preventDefault();
    const formData = new FormData(form);
    const eventObj = toEventObj(formData);
    let events = getEventsFromCookie();
    events.push(eventObj);
    setEventsToCookie(events);
    renderAllEvents();
    form.reset();
    form.onsubmit = defaultFormHandler;
};

// Update renderAllEvents to add actions
function renderAllEvents() {
    const eventsArr = getEventsFromCookie();
    const eventsCountdown = new EventsCountdown();
    eventsArr.forEach(e => {
        eventsCountdown.addEvent(new Event(e.title, e.start, e.end));
    });
    const eventsHtml = new EventsHtml(eventsCountdown);
    eventsHtml.startRendering();
    // For timeline chart
    window.timelineData = eventsArr.map(e => [
        e.title,
        new Date(e.start),
        e.end ? new Date(e.end) : new Date(e.start)
    ]);
    if (typeof google !== 'undefined' && google.visualization && google.visualization.Timeline) {
        if (typeof drawChart === 'function') drawChart();
    }
    addEventActions();
}

// Form handler
const form = document.getElementById('event-form');
if (form) {
    form.onsubmit = defaultFormHandler;
}

// Initial render from cookie
renderAllEvents();