import { EventsCountdown } from "./EventsCountdown.js";
import { Event } from "./Events.js";
import { EventsHtml } from "./EventsHtml.js";
import AuthService from "./AuthService.js";
import HybridStorage from "./HybridStorage.js";

// --- Initialize hybrid storage ---
const authService = new AuthService();
const storage = new HybridStorage(authService);

// --- Hybrid storage wrapper functions (keeps your existing interface) ---
async function getEventsFromStorage() {
    return await storage.getEvents();
}

async function setEventsToStorage(events) {
    await storage.saveAllEvents(events);
}

function toEventObj(formData) {
    return {
        title: formData.get("event-name"),
        start: formData.get("event-start-time"),
        end: formData.get("event-end-time") || undefined,
    };
}

// Edit event by index
async function editEventInStorage(index, newEvent) {
    await storage.updateEvent(index, newEvent);
    renderAllEvents();
}

// Remove event by index
async function removeEventFromStorage(index) {
    await storage.removeEvent(index);
    renderAllEvents();
}

// Add edit/remove buttons to each event in the UI
function addEventActions(sortedEvents) {
    const eventList = document.getElementById("events");
    if (!eventList) return;
    // Remove existing buttons to avoid duplicates
    eventList.querySelectorAll(".event-action").forEach((btn) => btn.remove());
    // Add buttons to each event
    Array.from(eventList.children).forEach((li, idx) => {
        // Edit button
        const editBtn = document.createElement("button");
        editBtn.textContent = "Edit";
        editBtn.className = "event-action";
        editBtn.onclick = async () => {
            // Use the sorted events array to get the correct event
            const event = sortedEvents[idx];
            // Fill form with event data
            form["event-name"].value = event.title;
            
            // Format datetime for datetime-local input
            if (event.start) {
                const startDate = new Date(event.start);
                form["event-start-time"].value = startDate.toISOString().slice(0, 16);
            }
            if (event.end) {
                const endDate = new Date(event.end);
                form["event-end-time"].value = endDate.toISOString().slice(0, 16);
            } else {
                form["event-end-time"].value = "";
            }
            
            // Find the original index in the unsorted array for storage operations
            const allEvents = await getEventsFromStorage();
            const originalIndex = allEvents.findIndex(e => 
                e.title === event.title && 
                e.start === event.start && 
                e.end === event.end
            );
            
            // On next submit, replace event instead of adding
            form.onsubmit = async function (e) {
                e.preventDefault();
                const formData = new FormData(form);
                const newEvent = toEventObj(formData);
                await editEventInStorage(originalIndex, newEvent);
                form.reset();
                form.onsubmit = defaultFormHandler;
            };
        };
        li.appendChild(editBtn);
        // Remove button
        const removeBtn = document.createElement("button");
        removeBtn.textContent = "Remove";
        removeBtn.className = "event-action";
        removeBtn.onclick = async () => {
            // Use the sorted events array to get the correct event
            const event = sortedEvents[idx];
            // Find the original index in the unsorted array for storage operations
            const allEvents = await getEventsFromStorage();
            const originalIndex = allEvents.findIndex(e => 
                e.title === event.title && 
                e.start === event.start && 
                e.end === event.end
            );
            removeEventFromStorage(originalIndex);
        };
        li.appendChild(removeBtn);
    });
}

// Save default form handler for restoring after edit
const defaultFormHandler = async function (e) {
    e.preventDefault();
    const formData = new FormData(form);
    const eventObj = toEventObj(formData);
    await storage.saveEvent(eventObj);
    renderAllEvents();
    form.reset();
    form.onsubmit = defaultFormHandler;
};

// Update renderAllEvents to add actions
async function renderAllEvents() {
    const eventsArr = await getEventsFromStorage();
    
    // Sort events by start date
    const sortedEvents = eventsArr.sort((a, b) => {
        const dateA = new Date(a.start);
        const dateB = new Date(b.start);
        return dateA - dateB;
    });
    
    const eventsCountdown = new EventsCountdown();
    sortedEvents.forEach((e) => {
        eventsCountdown.addEvent(new Event(e.title, e.start, e.end));
    });
    const eventsHtml = new EventsHtml(eventsCountdown);
    eventsHtml.startRendering();

    // Handle timeline chart
    const timelineContainer = document.getElementById("timeline");
    if (sortedEvents.length > 0) {
        // Show timeline and render chart
        timelineContainer.style.display = "block";

        // Prepare timeline data with validation
        window.timelineData = sortedEvents
            .map((e) => {
                const startDate = new Date(e.start);
                const endDate = e.end
                    ? new Date(e.end)
                    : new Date(startDate.getTime() + 24 * 60 * 60 * 1000); // Add 1 day if no end date

                // Validate dates
                if (isNaN(startDate.getTime())) {
                    console.warn("Invalid start date for event:", e.title);
                    return null;
                }
                if (isNaN(endDate.getTime())) {
                    console.warn("Invalid end date for event:", e.title);
                    return null;
                }

                return [e.title, startDate, endDate];
            })
            .filter((row) => row !== null); // Remove invalid entries

        // Only draw chart if we have valid data
        if (
            window.timelineData.length > 0 &&
            typeof google !== "undefined" &&
            google.visualization &&
            google.visualization.Timeline
        ) {
            if (typeof drawChart === "function") {
                setTimeout(drawChart, 100); // Small delay to ensure DOM is ready
            }
        } else {
            timelineContainer.style.display = "none";
        }
    } else {
        // Hide timeline when no events
        timelineContainer.style.display = "none";
        window.timelineData = [];
    }

    addEventActions(sortedEvents);
    updateStorageInfo();
}

// Storage info display
function updateStorageInfo() {
    const storageInfo = storage.getStorageInfo();
    let infoEl = document.getElementById("storage-info");
    if (!infoEl) {
        infoEl = document.createElement("div");
        infoEl.id = "storage-info";
        infoEl.className = "storage-info";
        document
            .querySelector(".container")
            .insertBefore(infoEl, document.getElementById("event-form"));
    }

    if (storageInfo.type === "cloud") {
        infoEl.innerHTML = `
            <div class="cloud-status">
                ☁️ <strong>Cloud Sync Active</strong> - ${storageInfo.description}
                <button id="sign-out-btn" class="small-btn">Sign Out</button>
            </div>
        `;
        document.getElementById("sign-out-btn").onclick = async () => {
            await authService.signOut();
            renderAllEvents();
        };
    } else {
        infoEl.innerHTML = `
            <div class="local-status">
                💾 <strong>Local Storage</strong> - ${storageInfo.description}
                <button id="sign-in-btn" class="small-btn">Sign in for Cloud Sync</button>
            </div>
        `;
        document.getElementById("sign-in-btn").onclick = async () => {
            try {
                await authService.signInWithGoogle();
                await storage.migrateCookiesToCloud();
                renderAllEvents();
            } catch (error) {
                console.error("Sign in failed:", error);
                alert("Sign in failed. Please try again.");
            }
        };
    }
}

// Listen for auth state changes
authService.onAuthStateChanged((user) => {
    if (user) {
        console.log("User signed in:", user.displayName);
        // Migrate cookie data to cloud
        storage.migrateCookiesToCloud().then(() => {
            renderAllEvents();
        });
    } else {
        console.log("User signed out");
        renderAllEvents();
    }
});

// Form handler
const form = document.getElementById("event-form");
if (form) {
    form.onsubmit = defaultFormHandler;
}

// Initial render
renderAllEvents();

// Set up automatic refresh every second
setInterval(() => {
    renderAllEvents();
}, 1000);
