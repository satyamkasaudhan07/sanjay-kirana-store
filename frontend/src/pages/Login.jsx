import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import Navbar from "../components/Navbar/Navbar";
import Footer from "../components/Footer/Footer";
import api, { getApiErrorMessage } from "../utils/api";
import { setSession, isAuthenticated } from "../utils/auth";
import { normalizeIndianPhone } from "../utils/phone";
import "./Login.css";

// Read MSG91 Widget configuration from Vite environment variables
const MSG91_WIDGET_ID = (import.meta.env.VITE_MSG91_WIDGET_ID || "").trim();
const MSG91_TOKEN_AUTH = (import.meta.env.VITE_MSG91_TOKEN_AUTH || "").trim();

function Login({ cart = [], wishlist = [] }) {
    const navigate = useNavigate();
    const location = useLocation();

    // If already logged in, redirect to orders
    useEffect(() => {
        if (isAuthenticated()) {
            navigate("/orders", { replace: true });
        }
    }, [navigate]);

    // UI state
    const [scriptLoaded, setScriptLoaded] = useState(false);
    const [scriptError, setScriptError] = useState(false);
    const [widgetTriggered, setWidgetTriggered] = useState(false);
    const [verifyingWithBackend, setVerifyingWithBackend] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    // Fallback mode for direct OTP in local testing / missing keys
    const [showFallback, setShowFallback] = useState(false);
    const [fallbackStep, setFallbackStep] = useState(1);
    const [phone, setPhone] = useState("");
    const [otp, setOtp] = useState("");
    const [fallbackLoading, setFallbackLoading] = useState(false);
    const [timer, setTimer] = useState(0);
    const otpInputRef = useRef(null);

    // Dynamic Safe Script Injection for MSG91 Web SDK (Default UI)
    useEffect(() => {
        const scriptId = "msg91-otp-provider-script";
        const existingScript = document.getElementById(scriptId);

        if (existingScript) {
            setScriptLoaded(true);
            return;
        }

        const script = document.createElement("script");
        script.id = scriptId;
        script.type = "text/javascript";
        script.src = "https://verify.msg91.com/otp-provider.js";
        script.async = true;

        script.onload = () => {
            console.debug("[MSG91] Web SDK script loaded successfully.");
            setScriptLoaded(true);
            setScriptError(false);
        };

        script.onerror = () => {
            console.error("[MSG91] Failed to load OTP provider script from verify.msg91.com.");
            setScriptError(true);
            setErrorMessage("Unable to connect to MSG91 OTP service. Please check your internet connection.");
        };

        document.body.appendChild(script);

        // Do not remove script on unmount so subsequent page visits reuse the cached SDK
    }, []);

    // Countdown timer for fallback resend OTP
    useEffect(() => {
        let interval = null;
        if (timer > 0) {
            interval = setInterval(() => {
                setTimer((prev) => prev - 1);
            }, 1000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [timer]);

    // Focus fallback OTP input when moving to step 2
    useEffect(() => {
        if (fallbackStep === 2 && otpInputRef.current) {
            otpInputRef.current.focus();
        }
    }, [fallbackStep]);

    /**
     * Handles MSG91 Web SDK Success Callback:
     * Receives the per-user access token from the widget, sends it to the Flask backend
     * over HTTPS, and sets the customer session ONLY upon 200 OK from server.
     */
    const handleWidgetSuccess = async (data) => {
        console.debug("[MSG91 SDK] Success callback received:", data);
        setWidgetTriggered(false);

        // Extract access token from response payload
        let accessToken = null;
        if (typeof data === "string") {
            accessToken = data;
        } else if (data && typeof data === "object") {
            accessToken = data["access-token"] || data.token || data.accessToken || data.message;
        }

        if (!accessToken || typeof accessToken !== "string" || !accessToken.trim()) {
            setErrorMessage("Could not extract verification access token from MSG91. Please try again.");
            return;
        }

        setErrorMessage("");
        setSuccessMessage("Mobile verified! Confirming with Sanjay Kirana Store server...");
        setVerifyingWithBackend(true);

        try {
            // Server-side verification (Phase 3)
            const resp = await api.post("/auth/msg91/verify", {
                access_token: accessToken.trim(),
            });

            const { token, user } = resp.data;
            if (token && user) {
                // Securely save session only after server validates token
                setSession(token, user);
                const destination = location.state?.from || "/orders";

                if (user.profile_completed === false) {
                    setSuccessMessage("Mobile verified! Please complete your delivery profile to start shopping.");
                    setTimeout(() => {
                        navigate("/complete-profile", { state: { from: destination }, replace: true });
                    }, 600);
                } else {
                    setSuccessMessage("Welcome back! Login verified successfully.");
                    setTimeout(() => {
                        navigate(destination, { replace: true });
                    }, 600);
                }
            } else {
                setErrorMessage("Invalid response from server. Please try logging in again.");
            }
        } catch (err) {
            console.error("[MSG91 Auth Error]:", err);
            setErrorMessage(getApiErrorMessage(err, "Server verification failed. Please try again."));
        } finally {
            setVerifyingWithBackend(false);
        }
    };

    /**
     * Handles MSG91 Web SDK Failure Callback
     */
    const handleWidgetFailure = (error) => {
        console.warn("[MSG91 SDK] Failure callback received:", error);
        setWidgetTriggered(false);
        let msg = "OTP verification failed or was cancelled.";
        if (typeof error === "string" && error.trim()) {
            msg = error;
        } else if (error && typeof error === "object") {
            msg = error.message || error.error || msg;
        }
        setErrorMessage(msg);
    };

    /**
     * Initializes and triggers the MSG91 Web SDK Default UI popup
     */
    const handleLaunchWidget = () => {
        setErrorMessage("");
        setSuccessMessage("");

        if (!MSG91_WIDGET_ID || !MSG91_TOKEN_AUTH) {
            setErrorMessage(
                "MSG91 credentials not detected. Please configure VITE_MSG91_WIDGET_ID and VITE_MSG91_TOKEN_AUTH in your frontend .env file, or use the direct OTP fallback below."
            );
            return;
        }

        // Configure MSG91 Web SDK (Default UI with India +91 default)
        const configuration = {
            widgetId: MSG91_WIDGET_ID,
            tokenAuth: MSG91_TOKEN_AUTH,
            identifier: "", // Optional prefill
            defaultCountry: "91",
            countryCode: "91",
            country: "IN",
            success: (data) => {
                handleWidgetSuccess(data);
            },
            failure: (error) => {
                handleWidgetFailure(error);
            },
        };

        window.configuration = configuration;

        if (typeof window.initSendOTP === "function") {
            try {
                setWidgetTriggered(true);
                window.initSendOTP(window.configuration);
            } catch (err) {
                console.error("[MSG91] Error invoking initSendOTP:", err);
                setWidgetTriggered(false);
                setErrorMessage("Could not initialize MSG91 popup. Please click Retry.");
            }
        } else {
            setErrorMessage("MSG91 service script is still loading. Please wait a moment and click again.");
        }
    };

    // -------------------------------------------------------------------------
    // Fallback Direct OTP methods (for local development & offline testing)
    // -------------------------------------------------------------------------
    const cleanPhone = (val) => val.replace(/\D/g, "").slice(0, 10);

    const handleFallbackSendOtp = async (e) => {
        e.preventDefault();
        setErrorMessage("");
        setSuccessMessage("");

        const sanitized = cleanPhone(phone);
        if (sanitized.length !== 10 || !/^[6-9]\d{9}$/.test(sanitized)) {
            setErrorMessage("Please enter a valid 10-digit Indian mobile number (starts with 6–9).");
            return;
        }

        setFallbackLoading(true);
        try {
            const resp = await api.post("/auth/send-otp", { phone: sanitized });
            setFallbackStep(2);
            setTimer(resp.data?.expires_in_seconds ? Math.min(resp.data.expires_in_seconds, 60) : 60);
            setSuccessMessage(`OTP sent to +91 ${sanitized}`);
        } catch (err) {
            setErrorMessage(getApiErrorMessage(err, "Failed to send OTP. Please check your mobile number."));
        } finally {
            setFallbackLoading(false);
        }
    };

    const handleFallbackVerifyOtp = async (e) => {
        e.preventDefault();
        setErrorMessage("");
        setSuccessMessage("");

        const sanitizedOtp = otp.trim().replace(/\D/g, "");
        if (sanitizedOtp.length !== 6) {
            setErrorMessage("Please enter the complete 6-digit OTP received on your mobile.");
            return;
        }

        setFallbackLoading(true);
        try {
            const resp = await api.post("/auth/verify-otp", {
                phone: cleanPhone(phone),
                otp: sanitizedOtp,
            });

            const { token, user } = resp.data;
            if (token && user) {
                setSession(token, user);
                const destination = location.state?.from || "/orders";

                if (user.profile_completed === false) {
                    setSuccessMessage("Mobile verified! Please complete your delivery profile to start shopping.");
                    setTimeout(() => {
                        navigate("/complete-profile", { state: { from: destination }, replace: true });
                    }, 600);
                } else {
                    setSuccessMessage("Login successful! Redirecting...");
                    setTimeout(() => {
                        navigate(destination, { replace: true });
                    }, 600);
                }
            } else {
                setErrorMessage("Invalid response from server. Please try again.");
            }
        } catch (err) {
            setErrorMessage(getApiErrorMessage(err, "Invalid OTP. Please check and try again."));
        } finally {
            setFallbackLoading(false);
        }
    };

    const handleFallbackResendOtp = async () => {
        if (timer > 0 || fallbackLoading) return;
        setErrorMessage("");
        setSuccessMessage("");
        setFallbackLoading(true);

        try {
            const resp = await api.post("/auth/send-otp", { phone: cleanPhone(phone) });
            setTimer(resp.data?.expires_in_seconds ? Math.min(resp.data.expires_in_seconds, 60) : 60);
            setSuccessMessage("A fresh OTP has been sent to your phone.");
        } catch (err) {
            setErrorMessage(getApiErrorMessage(err, "Failed to resend OTP. Please wait before retrying."));
        } finally {
            setFallbackLoading(false);
        }
    };

    const isConfigured = Boolean(MSG91_WIDGET_ID && MSG91_TOKEN_AUTH);

    return (
        <>
            <Navbar cart={cart} wishlist={wishlist} />

            <main className="login-page">
                <div className="login-card">
                    <div className="login-header">
                        <span className="login-badge">Customer Account</span>
                        <h1>Welcome to Sanjay Kirana Store</h1>
                        <p>
                            Fast, passwordless sign-in with instant mobile OTP verification via MSG91.
                        </p>
                    </div>

                    {errorMessage && (
                        <div className="login-alert error" role="alert">
                            <span className="alert-icon">⚠️</span>
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {successMessage && (
                        <div className="login-alert success" role="alert">
                            <span className="alert-icon">✓</span>
                            <span>{successMessage}</span>
                        </div>
                    )}

                    {/* Primary Flow: MSG91 Web SDK Default UI */}
                    {!showFallback ? (
                        <div className="msg91-widget-section">
                            <div className="msg91-features-card">
                                <div className="msg91-feature-item">
                                    <span className="feature-icon">⚡</span>
                                    <div>
                                        <strong>Instant Verification</strong>
                                        <p>Receive your one-time code via SMS or WhatsApp.</p>
                                    </div>
                                </div>
                                <div className="msg91-feature-item">
                                    <span className="feature-icon">🛡️</span>
                                    <div>
                                        <strong>Bank-Grade Security</strong>
                                        <p>Verified authoritatively by Sanjay Kirana Store server.</p>
                                    </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                className="login-primary-btn msg91-launch-btn"
                                onClick={handleLaunchWidget}
                                disabled={verifyingWithBackend || !scriptLoaded || scriptError}
                            >
                                {verifyingWithBackend ? (
                                    <>
                                        <span className="spinner-inline" />
                                        Validating with Server...
                                    </>
                                ) : widgetTriggered ? (
                                    "Verification Popup Active..."
                                ) : !scriptLoaded ? (
                                    "Loading Secure Gateway..."
                                ) : (
                                    "Sign In with Mobile OTP"
                                )}
                            </button>

                            {!isConfigured && (
                                <div className="widget-missing-hint">
                                    <span>⚠️ MSG91 Widget ID or Client Token is not set in <code>frontend/.env</code>.</span>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Secondary / Direct OTP Fallback Form */
                        <div className="fallback-section">
                            <div className="fallback-back-row">
                                <button
                                    type="button"
                                    className="back-to-widget-btn"
                                    onClick={() => {
                                        setShowFallback(false);
                                        setErrorMessage("");
                                    }}
                                >
                                    ← Back to MSG91 One-Click Login
                                </button>
                            </div>

                            {fallbackStep === 1 ? (
                                <form className="login-form" onSubmit={handleFallbackSendOtp} noValidate>
                                    <div className="form-group">
                                        <label htmlFor="fallback-phone-input">Mobile Number</label>
                                        <div className="phone-input-wrapper">
                                            <span className="country-code">+91</span>
                                            <input
                                                id="fallback-phone-input"
                                                type="tel"
                                                inputMode="numeric"
                                                maxLength="10"
                                                placeholder="Enter 10-digit number"
                                                value={phone}
                                                onChange={(e) => {
                                                    setPhone(e.target.value);
                                                    if (errorMessage) setErrorMessage("");
                                                }}
                                                autoFocus
                                                required
                                            />
                                        </div>
                                        <span className="input-hint">We will dispatch a 6-digit code via SMS.</span>
                                    </div>

                                    <button
                                        type="submit"
                                        className="login-primary-btn"
                                        disabled={fallbackLoading || cleanPhone(phone).length !== 10}
                                    >
                                        {fallbackLoading ? "Sending OTP..." : "Send Verification Code →"}
                                    </button>
                                </form>
                            ) : (
                                <form className="login-form" onSubmit={handleFallbackVerifyOtp} noValidate>
                                    <div className="form-group">
                                        <div className="otp-label-row">
                                            <label htmlFor="fallback-otp-input">6-Digit Code</label>
                                            <button
                                                type="button"
                                                className="change-phone-btn"
                                                onClick={() => {
                                                    setFallbackStep(1);
                                                    setOtp("");
                                                    setErrorMessage("");
                                                }}
                                            >
                                                Change Phone
                                            </button>
                                        </div>
                                        <input
                                            id="fallback-otp-input"
                                            ref={otpInputRef}
                                            type="text"
                                            inputMode="numeric"
                                            maxLength="6"
                                            placeholder="Enter 6-digit OTP"
                                            value={otp}
                                            onChange={(e) => {
                                                setOtp(e.target.value.replace(/\D/g, "").slice(0, 6));
                                                if (errorMessage) setErrorMessage("");
                                            }}
                                            className="otp-input-field"
                                            required
                                        />
                                        <div className="resend-row">
                                            {timer > 0 ? (
                                                <span className="timer-text">Resend in <strong>{timer}s</strong></span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="resend-btn"
                                                    onClick={handleFallbackResendOtp}
                                                    disabled={fallbackLoading}
                                                >
                                                    Resend OTP
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        className="login-primary-btn"
                                        disabled={fallbackLoading || otp.length !== 6}
                                    >
                                        {fallbackLoading ? "Verifying..." : "Verify & Sign In ✓"}
                                    </button>
                                </form>
                            )}
                        </div>
                    )}

                    <div className="login-footer-info">
                        <p>
                            🔒 <strong>Passwordless & Safe:</strong> No passwords to remember. Your mobile number is validated directly by the store backend.
                        </p>
                        <div className="owner-login-hint">
                            <span>Store operations:</span>{" "}
                            <Link to="/admin/login">Admin Login</Link>
                            <span> • </span>
                            <Link to="/owner/login" style={{ color: "#92400e", fontWeight: "600" }}>👑 Owner Login (Sanjay)</Link>
                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </>
    );
}

export default Login;
