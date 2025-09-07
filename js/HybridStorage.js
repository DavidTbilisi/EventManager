// Hybrid Storage: Uses Firebase for authenticated users, cookies for everyone else
import {
    db,
    collection,
    addDoc,
    getDocs,
    query,
    where,
    deleteDoc,
    doc,
} from "./firebase-config.js";

export default class HybridStorage {
    constructor(authService) {
        this.authService = authService;
        this.collectionName = "events";
    }

    // --- COOKIE METHODS (your existing system) ---
    getEventsFromCookie() {
        const cookie = document.cookie
            .split("; ")
            .find((row) => row.startsWith("events="));
        if (cookie) {
            try {
                return JSON.parse(decodeURIComponent(cookie.split("=")[1]));
            } catch (e) {
                return [];
            }
        }
        return [];
    }

    setEventsToCookie(events) {
        document.cookie = `events=${encodeURIComponent(
            JSON.stringify(events)
        )}; path=/; max-age=31536000`;
    }

    // --- FIREBASE METHODS ---
    async saveEventToFirebase(eventData) {
        if (!this.authService.isAuthenticated()) {
            throw new Error("User must be authenticated for cloud storage");
        }

        try {
            const userId = this.authService.getUserId();
            const docRef = await addDoc(collection(db, this.collectionName), {
                ...eventData,
                userId: userId,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            console.log("Event saved to cloud:", docRef.id);
            return docRef.id;
        } catch (error) {
            console.error("Error saving to Firebase:", error);
            throw error;
        }
    }

    async getEventsFromFirebase() {
        if (!this.authService.isAuthenticated()) {
            throw new Error("User must be authenticated for cloud storage");
        }

        try {
            const userId = this.authService.getUserId();
            const q = query(
                collection(db, this.collectionName),
                where("userId", "==", userId)
            );

            const querySnapshot = await getDocs(q);
            const events = [];

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                events.push({
                    id: doc.id,
                    title: data.title,
                    start: data.start,
                    end: data.end,
                });
            });

            console.log("Retrieved from cloud:", events.length, "events");
            return events;
        } catch (error) {
            console.error("Error getting from Firebase:", error);
            throw error;
        }
    }

    async clearFirebaseEvents() {
        if (!this.authService.isAuthenticated()) {
            throw new Error("User must be authenticated for cloud storage");
        }

        try {
            const events = await this.getEventsFromFirebase();
            for (const event of events) {
                if (event.id) {
                    await deleteDoc(doc(db, this.collectionName, event.id));
                }
            }
            console.log("Cleared all events from cloud");
        } catch (error) {
            console.error("Error clearing Firebase events:", error);
            throw error;
        }
    }

    // --- HYBRID METHODS ---
    async getEvents() {
        if (this.authService.isAuthenticated()) {
            try {
                return await this.getEventsFromFirebase();
            } catch (error) {
                console.warn(
                    "Failed to get from cloud, falling back to cookies:",
                    error
                );
                return this.getEventsFromCookie();
            }
        } else {
            return this.getEventsFromCookie();
        }
    }

    async saveEvent(eventData) {
        if (this.authService.isAuthenticated()) {
            try {
                return await this.saveEventToFirebase(eventData);
            } catch (error) {
                console.warn(
                    "Failed to save to cloud, saving to cookies:",
                    error
                );
                // Fallback to cookies
                const events = this.getEventsFromCookie();
                events.push(eventData);
                this.setEventsToCookie(events);
                return null;
            }
        } else {
            // Save to cookies
            const events = this.getEventsFromCookie();
            events.push(eventData);
            this.setEventsToCookie(events);
            return null;
        }
    }

    async saveAllEvents(eventsArray) {
        if (this.authService.isAuthenticated()) {
            try {
                // Clear existing events first
                await this.clearFirebaseEvents();
                // Save new events
                const savePromises = eventsArray.map((event) =>
                    this.saveEventToFirebase(event)
                );
                await Promise.all(savePromises);
                console.log("Saved all events to cloud");
            } catch (error) {
                console.warn(
                    "Failed to save to cloud, saving to cookies:",
                    error
                );
                this.setEventsToCookie(eventsArray);
            }
        } else {
            this.setEventsToCookie(eventsArray);
        }
    }

    async updateEvent(index, newEventData) {
        if (this.authService.isAuthenticated()) {
            try {
                // For Firebase, we need to get all events, update locally, then save all
                const events = await this.getEventsFromFirebase();
                if (index >= 0 && index < events.length) {
                    events[index] = { ...newEventData };
                    await this.saveAllEvents(events);
                }
            } catch (error) {
                console.warn(
                    "Failed to update in cloud, falling back to cookies:",
                    error
                );
                this.updateEventInCookie(index, newEventData);
            }
        } else {
            this.updateEventInCookie(index, newEventData);
        }
    }

    async removeEvent(index) {
        if (this.authService.isAuthenticated()) {
            try {
                const events = await this.getEventsFromFirebase();
                if (index >= 0 && index < events.length) {
                    events.splice(index, 1);
                    await this.saveAllEvents(events);
                }
            } catch (error) {
                console.warn(
                    "Failed to remove from cloud, falling back to cookies:",
                    error
                );
                this.removeEventFromCookie(index);
            }
        } else {
            this.removeEventFromCookie(index);
        }
    }

    // Cookie fallback methods
    updateEventInCookie(index, newEvent) {
        let events = this.getEventsFromCookie();
        if (index >= 0 && index < events.length) {
            events[index] = newEvent;
            this.setEventsToCookie(events);
        }
    }

    removeEventFromCookie(index) {
        let events = this.getEventsFromCookie();
        if (index >= 0 && index < events.length) {
            events.splice(index, 1);
            this.setEventsToCookie(events);
        }
    }

    // Migration: Move cookie data to cloud when user signs in
    async migrateCookiesToCloud() {
        if (!this.authService.isAuthenticated()) {
            return;
        }

        try {
            const cookieEvents = this.getEventsFromCookie();
            if (cookieEvents.length > 0) {
                console.log(
                    "Migrating",
                    cookieEvents.length,
                    "events to cloud..."
                );
                await this.saveAllEvents(cookieEvents);
                console.log("Migration completed successfully");

                // Optionally clear cookies after successful migration
                // this.setEventsToCookie([]);
            }
        } catch (error) {
            console.error("Failed to migrate events to cloud:", error);
        }
    }

    // Get storage type info
    getStorageInfo() {
        if (this.authService.isAuthenticated()) {
            const user = this.authService.getUserInfo();
            return {
                type: "cloud",
                user: user,
                description: `Synced to cloud for ${user.name}`,
            };
        } else {
            return {
                type: "local",
                user: null,
                description: "Stored locally (cookies)",
            };
        }
    }
}
