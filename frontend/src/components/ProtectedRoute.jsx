import { Navigate, useLocation } from "react-router-dom";
import { isAuthenticated, getUser } from "../utils/auth";

/**
 * Route guard component that restricts access by authentication, role, and onboarding status.
 * 
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {"admin"|"customer"|"owner"|string} [props.requiredRole]
 * @param {string[]} [props.allowedRoles]
 * @param {boolean} [props.requireCompleteProfile]
 */
function ProtectedRoute({
    children,
    requiredRole,
    allowedRoles,
    requireCompleteProfile = false,
}) {
    const location = useLocation();

    if (!isAuthenticated()) {
        const isStaff =
            requiredRole === "admin" ||
            requiredRole === "owner" ||
            (allowedRoles && (allowedRoles.includes("admin") || allowedRoles.includes("owner")));
        const redirectPath = isStaff ? "/admin/login" : "/login";
        return <Navigate to={redirectPath} state={{ from: location.pathname }} replace />;
    }

    const user = getUser();
    const effectiveRoles = allowedRoles || (requiredRole ? [requiredRole] : ["admin"]);

    if (effectiveRoles.length > 0 && !effectiveRoles.includes(user?.role)) {
        const fallbackPath = user?.role === "customer" ? "/" : "/admin/login";
        return <Navigate to={fallbackPath} state={{ from: location.pathname }} replace />;
    }

    // Customer profile completion logic
    if (user?.role === "customer") {
        // If on /complete-profile and profile is ALREADY complete, redirect to target
        if (location.pathname === "/complete-profile" && user?.profile_completed === true) {
            const dest = location.state?.from || "/account";
            return <Navigate to={dest} replace />;
        }

        // If route requires complete profile and customer has not completed it
        if (requireCompleteProfile && user?.profile_completed === false && location.pathname !== "/complete-profile") {
            return <Navigate to="/complete-profile" state={{ from: location.pathname }} replace />;
        }
    }

    return children;
}

export default ProtectedRoute;

