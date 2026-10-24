import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { getApiErrorMessage } from "../utils/api";
import { setSession, isAdmin } from "../utils/auth";
import "./AdminLogin.css";

// Read MSG91 Widget configuration from Vite environment variables
const MSG91_WIDGET_ID = (import.meta.env.VITE_MSG91_WIDGET_ID || "").trim();
const MSG91_TOKEN_AUTH = (import.meta.env.VITE_MSG91_TOKEN_AUTH || "").trim();
const FIXED_ADMIN_PHONE = "9554384886";

function AdminLogin() {
    const navigate = useNavigate();

    // If already logged in as admin, navigate directly to dashboard
    useEffect(() => {
        if (isAdmin()) {
            navigate("/admin/dashboard", { replace: true });
        }
    }, [navigate]);

    // Step 1 = credentials, Step 2 = MSG91 Widget OTP Verification
    const [step, setStep] = useState(1);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [challengeId, setChallengeId] = useState("");
    const [maskedPhone, setMaskedPhone] = useState("+91 9554384886");
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    // Widget script and verification state
    const [scriptLoaded, setScriptLoaded] = useState(false);
    const [verifyingWidget, setVerifyingWidget] = useState(false);
    const [widgetLaunched, setWidgetLaunched] = useState(false);

    // MSG91 Throttling & IP Block protection
    const [isIpBlocked, setIsIpBlocked] = useState(false);
    const [blockedCooldown, setBlockedCooldown] = useState(0);
    const isLaunchingRef = useRef(false);

    // Safe dynamic loading of MSG91 Web SDK script
    useEffect(() => {
        const scriptId = "msg91-otp-provider-script";
        if (document.getElementById(scriptId)) {
            setScriptLoaded(true);
            return;
        }

        const script = document.createElement("script");
        script.id = scriptId;
        script.type = "text/javascript";
        script.src = "https://verify.msg91.com/otp-provider.js";
        script.async = true;
        script.onload = () => setScriptLoaded(true);
        script.onerror = () => {
            console.error("Failed to load MSG91 SDK script from verify.msg91.com");
            setScriptLoaded(false);
        };
        document.body.appendChild(script);
    }, []);

    // Countdown timer for IP Blocked cooldown
    useEffect(() => {
        let interval = null;
        if (blockedCooldown > 0) {
            interval = setInterval(() => {
                setBlockedCooldown((prev) => {
                    if (prev <= 1) {
                        setIsIpBlocked(false);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [blockedCooldown]);

    // Step 1: Credentials verification
    const handleStepA = async (e) => {
        e.preventDefault();
        setErrorMessage("");
        setSuccessMessage("");

        if (!username.trim()) {
            setErrorMessage("Please enter your admin username.");
            return;
        }
        if (!password) {
            setErrorMessage("Please enter your admin password.");
            return;
        }

        setLoading(true);
        try {
            const resp = await api.post("/auth/admin/login", {
                username: username.trim(),
                password: password,
            });

            const { challenge_id, masked_phone } = resp.data;
            if (challenge_id) {
                setChallengeId(challenge_id);
                setMaskedPhone(masked_phone || "+91 9554384886");
                setStep(2);
                setSuccessMessage("Step 1 passed! Please complete OTP verification via MSG91 widget.");
            } else {
                setErrorMessage("Unexpected response from authentication server.");
            }
        } catch (err) {
            setErrorMessage(getApiErrorMessage(err, "Invalid username or password."));
        } finally {
            setLoading(false);
        }
    };

    // MSG91 Widget Launch (Exclusive Step 2 OTP Method)
    const handleLaunchWidgetForAdmin = () => {
        setErrorMessage("");
        setSuccessMessage("");

        if (isIpBlocked && blockedCooldown > 0) {
            const mins = Math.floor(blockedCooldown / 60);
            const secs = blockedCooldown % 60;
            setErrorMessage(`Network IP is temporarily restricted by MSG91 (IPBlocked). Please wait ${mins}m ${secs}s before trying again.`);
            return;
        }

        if (isLaunchingRef.current || verifyingWidget) {
            return;
        }

        if (!MSG91_WIDGET_ID || !MSG91_TOKEN_AUTH) {
            setErrorMessage("MSG91 widget configuration missing in frontend environment. Please check VITE_MSG91_WIDGET_ID.");
            return;
        }

        if (typeof window.initSendOTP !== "function") {
            setErrorMessage("MSG91 service is initializing. Please wait a moment and try again.");
            return;
        }

        isLaunchingRef.current = true;
        setTimeout(() => {
            isLaunchingRef.current = false;
        }, 2000);

        setWidgetLaunched(true);

        const configuration = {
            widgetId: MSG91_WIDGET_ID,
            tokenAuth: MSG91_TOKEN_AUTH,
            identifier: `91${FIXED_ADMIN_PHONE}`, // Fixed registered admin phone
            defaultCountry: "91",
            countryCode: "91",
            country: "IN",
            success: async (data) => {
                isLaunchingRef.current = false;
                let accessToken = null;
                if (typeof data === "string") {
                    accessToken = data;
                } else if (data && typeof data === "object") {
                    accessToken = data["access-token"] || data.token || data.accessToken || data.message;
                }

                if (!accessToken) {
                    setErrorMessage("Could not extract verification access token from MSG91 widget.");
                    return;
                }

                setVerifyingWidget(true);
                setSuccessMessage("Phone verified via MSG91! Authorizing administrator session...");

                try {
                    const resp = await api.post("/auth/admin/msg91/verify", {
                        challenge_id: challengeId,
                        access_token: accessToken.trim(),
                    });

                    const { token, admin } = resp.data;
                    if (token && admin) {
                        setSession(token, admin);
                        setSuccessMessage("Admin authentication successful! Accessing Admin Dashboard...");
                        setTimeout(() => {
                            navigate("/admin/dashboard", { replace: true });
                        }, 800);
                    } else {
                        setErrorMessage("Failed to acquire admin token from server.");
                    }
                } catch (err) {
                    const apiMsg = getApiErrorMessage(err, "Admin server verification failed. Please try again.");
                    const isBlocked = err.response?.status === 429 ||
                                      err.response?.data?.code === "IPBlocked" ||
                                      apiMsg.toLowerCase().includes("ipblock") ||
                                      apiMsg.toLowerCase().includes("throttle");
                    if (isBlocked) {
                        setIsIpBlocked(true);
                        setBlockedCooldown(900);
                    }
                    setErrorMessage(apiMsg);
                } finally {
                    setVerifyingWidget(false);
                    isLaunchingRef.current = false;
                }
            },
            failure: (err) => {
                isLaunchingRef.current = false;
                setWidgetLaunched(false);
                const msg = typeof err === "string" ? err : err?.message || "Widget verification cancelled or timed out.";
                const lower = String(msg).toLowerCase();
                if (lower.includes("ipblock") || lower.includes("throttle") || lower.includes("blocked")) {
                    setIsIpBlocked(true);
                    setBlockedCooldown(900);
                    setErrorMessage(
                        "MSG91 Security Restriction (IPBlocked): Too many OTP requests were made in a short time. " +
                        "The provider has temporarily restricted your network IP. Please wait 15 minutes before retrying, " +
                        "or unblock your IP in MSG91 Dashboard ➔ OTP Widget ➔ Token Settings."
                    );
                } else {
                    setErrorMessage(msg);
                }
            },
        };

        window.configuration = configuration;
        try {
            window.initSendOTP(window.configuration);
        } catch (err) {
            console.error("Failed to launch MSG91 widget for admin:", err);
            isLaunchingRef.current = false;
            setWidgetLaunched(false);
            setErrorMessage("Could not launch MSG91 popup. Please check your browser popup blocker.");
        }
    };

    return (
        <main className="admin-login-page">
            <div className="admin-login-card">
                <div className="admin-portal-badge">
                    <span className="badge-shield">🛡️</span>
                    <span>Store Management Portal</span>
                </div>

                <div className="admin-login-header">
                    <h1>Owner Admin Login</h1>
                    <p>
                        {step === 1
                            ? "Step 1 of 2: Enter your owner credentials to initiate authentication."
                            : `Step 2 of 2: MSG91 OTP Verification for ${maskedPhone}`}
                    </p>
                </div>

                {errorMessage && (
                    <div className="admin-login-alert error" role="alert">
                        <span>⚠️</span>
                        <span>{errorMessage}</span>
                    </div>
                )}

                {successMessage && (
                    <div className="admin-login-alert success" role="alert">
                        <span>✓</span>
                        <span>{successMessage}</span>
                    </div>
                )}

                {step === 1 ? (
                    <form className="admin-login-form" onSubmit={handleStepA}>
                        <div className="form-group">
                            <label htmlFor="admin-username">Username</label>
                            <input
                                id="admin-username"
                                type="text"
                                placeholder="Enter admin username"
                                value={username}
                                onChange={(e) => {
                                    setUsername(e.target.value);
                                    if (errorMessage) setErrorMessage("");
                                }}
                                autoFocus
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="admin-password">Password</label>
                            <input
                                id="admin-password"
                                type="password"
                                placeholder="••••••••••••"
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    if (errorMessage) setErrorMessage("");
                                }}
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            className="admin-login-btn"
                            disabled={loading || !username.trim() || !password}
                        >
                            {loading ? "Verifying Credentials..." : "Continue to Step 2 (MSG91 OTP) →"}
                        </button>
                    </form>
                ) : (
                    <div className="admin-login-form">
                        <div className="step-b-info-box">
                            <p>
                                📲 <strong>Two-Step MSG91 Verification:</strong>
                            </p>
                            <p className="phone-notice">
                                One-Time Password will be verified via MSG91 widget for registered admin mobile <strong>{maskedPhone}</strong>.
                            </p>
                        </div>

                        {isIpBlocked && (
                            <div className="ip-blocked-notice" style={{
                                background: "#fef2f2",
                                border: "1px solid #fecaca",
                                borderRadius: "8px",
                                padding: "12px 14px",
                                margin: "12px 0",
                                fontSize: "0.85rem",
                                color: "#991b1b"
                            }}>
                                <strong>🛡️ Provider Rate Limit / IP Block Active:</strong>
                                <p style={{ margin: "6px 0 0 0", lineHeight: "1.4" }}>
                                    MSG91 has temporarily restricted OTP requests due to repeated attempts.
                                    {blockedCooldown > 0 ? (
                                        <> Cooldown remaining: <strong>{Math.floor(blockedCooldown / 60)}m {blockedCooldown % 60}s</strong>.</>
                                    ) : (
                                        <> Cooldown expired. You may now retry or unblock your IP in MSG91 Token Settings.</>
                                    )}
                                </p>
                            </div>
                        )}

                        <div className="admin-otp-actions" style={{ flexDirection: "column", gap: "12px", width: "100%", margin: "16px 0" }}>
                            <button
                                type="button"
                                className="admin-login-btn verified"
                                onClick={handleLaunchWidgetForAdmin}
                                disabled={verifyingWidget || loading || (isIpBlocked && blockedCooldown > 0)}
                                style={{ width: "100%", padding: "14px", fontSize: "1rem" }}
                            >
                                {verifyingWidget
                                    ? "Authorizing Session..."
                                    : isIpBlocked && blockedCooldown > 0
                                    ? `IP Restricted (Wait ${Math.floor(blockedCooldown / 60)}m ${blockedCooldown % 60}s)`
                                    : "⚡ Open MSG91 OTP Verification Popup"}
                            </button>

                            <button
                                type="button"
                                className="admin-back-btn"
                                onClick={() => {
                                    setStep(1);
                                    setWidgetLaunched(false);
                                    setErrorMessage("");
                                    setSuccessMessage("");
                                }}
                                style={{ alignSelf: "center", marginTop: "6px" }}
                            >
                                ← Back to Credentials
                            </button>
                        </div>
                    </div>
                )}

                <div className="admin-login-footer">
                    <p>
                        🔒 Unauthorized access attempts are monitored and logged to protect customer data.
                    </p>
                    <div className="return-store-link" style={{ display: "flex", justifyContent: "center", gap: "16px", marginTop: "10px" }}>
                        <Link to="/owner/login" style={{ color: "#92400e", fontWeight: "600" }}>👑 Store Owner Login (Sanjay)</Link>
                        <span style={{ color: "#cbd5e1" }}>•</span>
                        <Link to="/">← Return to Store</Link>
                    </div>
                </div>
            </div>
        </main>
    );
}

export default AdminLogin;
