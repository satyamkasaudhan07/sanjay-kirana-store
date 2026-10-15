import axios from "axios";
import { getToken } from "./auth";

/**
 * Base API URL resolved from Vite environment variables:
 * - VITE_API_URL in .env (or .env.production when deployed)
 * - Falls back to http://127.0.0.1:5000 for local development.
 * Strips trailing slashes to prevent double-slash URLs (e.g. "...onrender.com//products").
 */
const rawUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000";
export const API_URL = rawUrl.replace(/\/+$/, "");

/**
 * Centralized Axios client instance:
 * - Pre-configured baseURL
 * - 15-second timeout (handles Render cold-starts gracefully)
 * - Standard JSON headers
 * - Development-mode request/response logging
 * - Normalized, safe user-facing error extraction
 */
const api = axios.create({
    baseURL: API_URL,
    timeout: 15000,
    headers: {
        "Content-Type": "application/json",
    },
});

// Request interceptor: attaches Bearer auth token and logs in development mode
api.interceptors.request.use(
    (config) => {
        const token = getToken();
        if (token) {
            config.headers = config.headers || {};
            config.headers.Authorization = `Bearer ${token}`;
        }
        if (import.meta.env.DEV) {
            console.debug(`[API] ${config.method?.toUpperCase()} ${config.baseURL || ""}${config.url}`);
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor: normalizes error messages and logs diagnostics safely
api.interceptors.response.use(
    (response) => response,
    (error) => {
        let userMessage = "An unexpected error occurred. Please try again.";

        if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
            userMessage = "Request timed out. If the backend is waking up (Render free tier), please wait a moment and click Retry.";
        } else if (!error.response) {
            userMessage = `Unable to connect to backend server at ${API_URL}. Please ensure the Flask server is running and reachable.`;
        } else if (error.response.data?.error && typeof error.response.data.error === "string") {
            userMessage = error.response.data.error;
        } else if (error.response.data?.message && typeof error.response.data.message === "string") {
            userMessage = error.response.data.message;
        } else if (error.response.status === 404) {
            userMessage = "Requested resource was not found on the server.";
        } else if (error.response.status >= 500) {
            userMessage = "Server encountered an error while processing the request.";
        }

        // Attach sanitized message to the error object
        error.userMessage = userMessage;

        if (import.meta.env.DEV) {
            console.error("[API Error Diagnostic]:", {
                endpoint: error.config?.url,
                fullUrl: `${error.config?.baseURL || ""}${error.config?.url || ""}`,
                status: error.response?.status,
                userMessage,
                code: error.code,
            });
        }

        return Promise.reject(error);
    }
);

/**
 * Helper to safely extract user-friendly error text from an Axios error
 */
export function getApiErrorMessage(error, fallback = "Unable to complete request.") {
    if (!error) return fallback;
    return error.userMessage || error.response?.data?.error || error.response?.data?.message || error.message || fallback;
}

export default api;
