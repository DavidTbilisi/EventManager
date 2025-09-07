// Optional Firebase Authentication Service
import {
    auth,
    provider,
    signInWithPopup,
    signOut,
    onAuthStateChanged,
} from "./firebase-config.js";

export default class AuthService {
    constructor() {
        this.user = null;
        this.isInitialized = false;
        this.onAuthStateChangedCallbacks = [];

        // Initialize Firebase Auth if available
        this.initializeAuth();
    }

    async initializeAuth() {
        try {
            // Listen for authentication state changes
            onAuthStateChanged(auth, (user) => {
                this.user = user;
                this.isInitialized = true;
                this.notifyAuthStateChanged(user);
            });
        } catch (error) {
            console.warn("Firebase Auth not available:", error);
            this.isInitialized = true;
        }
    }

    // Optional sign in with Google
    async signInWithGoogle() {
        try {
            const result = await signInWithPopup(auth, provider);
            this.user = result.user;
            console.log("Successfully signed in:", this.user.displayName);
            return this.user;
        } catch (error) {
            console.error("Error signing in:", error);
            throw error;
        }
    }

    // Sign out
    async signOut() {
        try {
            await signOut(auth);
            this.user = null;
            console.log("Successfully signed out");
        } catch (error) {
            console.error("Error signing out:", error);
            throw error;
        }
    }

    // Get current user
    getCurrentUser() {
        return this.user;
    }

    // Check if user is authenticated
    isAuthenticated() {
        return this.user !== null;
    }

    // Get user ID for database queries
    getUserId() {
        return this.user ? this.user.uid : null;
    }

    // Get user info
    getUserInfo() {
        if (!this.user) return null;
        return {
            id: this.user.uid,
            name: this.user.displayName,
            email: this.user.email,
            photo: this.user.photoURL,
        };
    }

    // Subscribe to authentication state changes
    onAuthStateChanged(callback) {
        this.onAuthStateChangedCallbacks.push(callback);
        // If already initialized, call immediately
        if (this.isInitialized) {
            callback(this.user);
        }
    }

    // Notify all subscribers of authentication state changes
    notifyAuthStateChanged(user) {
        this.onAuthStateChangedCallbacks.forEach((callback) => {
            try {
                callback(user);
            } catch (error) {
                console.error("Error in auth state callback:", error);
            }
        });
    }

    // Check if Firebase is available
    isFirebaseAvailable() {
        return typeof auth !== "undefined";
    }
}
