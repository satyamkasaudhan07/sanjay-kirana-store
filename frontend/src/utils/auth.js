/**
 * Authentication utility for Sanjay Kirana Store
 * Manages JWT tokens, user profiles, roles, and session persistence in localStorage.
 */

const TOKEN_KEY = "sk_auth_token";
const USER_KEY = "sk_auth_user";

/**
 * Retrieves the stored JWT token.
 * @returns {string|null}
 */
export function getToken() {
    try {
        return localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

/**
 * Retrieves the current authenticated user/admin profile.
 * @returns {object|null}
 */
export function getUser() {
    try {
        const stored = localStorage.getItem(USER_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch {
        return null;
    }
}

/**
 * Stores the authentication session (token & profile) and dispatches an event.
 * @param {string} token 
 * @param {object} user 
 */
export function setSession(token, user) {
    try {
        if (token) {
            localStorage.setItem(TOKEN_KEY, token);
        }
        if (user) {
            localStorage.setItem(USER_KEY, JSON.stringify(user));
        }
        window.dispatchEvent(new Event("sk_auth_changed"));
    } catch (err) {
        console.error("Failed to save auth session to localStorage", err);
    }
}

/**
 * Clears the authentication session and dispatches an event.
 */
export function clearSession() {
    try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem("orders");
        window.dispatchEvent(new Event("sk_auth_changed"));
    } catch (err) {
        console.error("Failed to clear auth session", err);
    }
}

/**
 * Checks whether there is an active authenticated session.
 * @returns {boolean}
 */
export function isAuthenticated() {
    return Boolean(getToken());
}

/**
 * Checks if the authenticated user has customer role.
 * @returns {boolean}
 */
export function isCustomer() {
    const user = getUser();
    return Boolean(user && user.role === "customer");
}

/**
 * Checks if the authenticated user has owner admin role.
 * @returns {boolean}
 */
export function isAdmin() {
    const user = getUser();
    return Boolean(user && user.role === "admin");
}

/**
 * Checks if the authenticated user has owner role.
 * @returns {boolean}
 */
export function isOwner() {
    const user = getUser();
    return Boolean(user && user.role === "owner");
}

/**
 * Checks if user is authorized for store management (admin or owner).
 * @returns {boolean}
 */
export function hasStaffAccess() {
    const user = getUser();
    return Boolean(user && (user.role === "admin" || user.role === "owner"));
}

/**
 * Updates partial user fields in localStorage and emits sk_auth_changed event.
 * @param {object} partialUser
 */
export function updateUser(partialUser) {
    try {
        const current = getUser() || {};
        const merged = { ...current, ...partialUser };
        localStorage.setItem(USER_KEY, JSON.stringify(merged));
        window.dispatchEvent(new Event("sk_auth_changed"));
    } catch (err) {
        console.error("Failed to update user session", err);
    }
}

/**
 * Logs out the current user or admin.
 */
export function logout() {
    clearSession();
}

