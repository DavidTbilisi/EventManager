// Hybrid Storage: Uses Firebase for authenticated users, cookies for everyone else.
// Every event carries a stable `id` (Firestore doc.id in cloud mode, generated UUID in cookie mode).
import {
    db,
    collection,
    addDoc,
    getDocs,
    query,
    where,
    deleteDoc,
    updateDoc,
    doc,
} from "./firebase-config.js";

function generateId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default class HybridStorage {
    constructor(authService) {
        this.authService = authService;
        this.collectionName = "events";
    }

    // --- COOKIE METHODS ---
    getEventsFromCookie() {
        const cookie = document.cookie
            .split("; ")
            .find((row) => row.startsWith("events="));
        if (!cookie) return [];
        let events;
        try {
            events = JSON.parse(decodeURIComponent(cookie.split("=")[1]));
        } catch (e) {
            return [];
        }
        if (!Array.isArray(events)) return [];

        // Backfill ids for events written by older versions.
        let mutated = false;
        events = events.map((e) => {
            if (!e || typeof e !== "object") return e;
            if (!e.id) {
                mutated = true;
                return { ...e, id: generateId() };
            }
            return e;
        });
        if (mutated) this.setEventsToCookie(events);
        return events;
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
        const userId = this.authService.getUserId();
        // Strip any incoming id — Firestore assigns its own.
        const { id: _ignored, ...data } = eventData;
        const docRef = await addDoc(collection(db, this.collectionName), {
            ...data,
            userId,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        return docRef.id;
    }

    async getEventsFromFirebase() {
        if (!this.authService.isAuthenticated()) {
            throw new Error("User must be authenticated for cloud storage");
        }
        const userId = this.authService.getUserId();
        const q = query(
            collection(db, this.collectionName),
            where("userId", "==", userId)
        );
        const snapshot = await getDocs(q);
        const events = [];
        snapshot.forEach((d) => {
            const data = d.data();
            events.push({
                id: d.id,
                title: data.title,
                start: data.start,
                end: data.end,
            });
        });
        return events;
    }

    // --- HYBRID METHODS ---
    async getEvents() {
        if (this.authService.isAuthenticated()) {
            try {
                return await this.getEventsFromFirebase();
            } catch (error) {
                console.warn("Cloud read failed, falling back to cookies:", error);
                return this.getEventsFromCookie();
            }
        }
        return this.getEventsFromCookie();
    }

    async saveEvent(eventData) {
        if (this.authService.isAuthenticated()) {
            try {
                const id = await this.saveEventToFirebase(eventData);
                return id;
            } catch (error) {
                console.warn("Cloud save failed, saving to cookies:", error);
            }
        }
        const events = this.getEventsFromCookie();
        const id = generateId();
        events.push({ ...eventData, id });
        this.setEventsToCookie(events);
        return id;
    }

    async updateEvent(id, newEventData) {
        if (!id) throw new Error("updateEvent requires an id");
        if (this.authService.isAuthenticated()) {
            try {
                const { id: _ignored, ...data } = newEventData;
                await updateDoc(doc(db, this.collectionName, id), {
                    ...data,
                    updatedAt: new Date(),
                });
                return;
            } catch (error) {
                console.warn("Cloud update failed, falling back to cookies:", error);
            }
        }
        const events = this.getEventsFromCookie();
        const idx = events.findIndex((e) => e.id === id);
        if (idx >= 0) {
            events[idx] = { ...newEventData, id };
            this.setEventsToCookie(events);
        }
    }

    async removeEvent(id) {
        if (!id) throw new Error("removeEvent requires an id");
        if (this.authService.isAuthenticated()) {
            try {
                await deleteDoc(doc(db, this.collectionName, id));
                return;
            } catch (error) {
                console.warn("Cloud delete failed, falling back to cookies:", error);
            }
        }
        const events = this.getEventsFromCookie();
        const next = events.filter((e) => e.id !== id);
        this.setEventsToCookie(next);
    }

    // Migration: append cookie events to cloud, then clear the cookie.
    // Only call on explicit sign-in — not from auth-state listeners.
    async migrateCookiesToCloud() {
        if (!this.authService.isAuthenticated()) return;
        const cookieEvents = this.getEventsFromCookie();
        if (cookieEvents.length === 0) return;
        try {
            for (const ev of cookieEvents) {
                const { id: _ignored, ...data } = ev;
                await this.saveEventToFirebase(data);
            }
            this.setEventsToCookie([]);
        } catch (error) {
            console.error("Failed to migrate cookie events to cloud:", error);
            // Leave cookies in place so the user doesn't lose data.
            throw error;
        }
    }

    getStorageInfo() {
        if (this.authService.isAuthenticated()) {
            const user = this.authService.getUserInfo();
            return {
                type: "cloud",
                user,
                description: `Synced to cloud for ${user.name}`,
            };
        }
        return {
            type: "local",
            user: null,
            description: "Stored locally (cookies)",
        };
    }
}
