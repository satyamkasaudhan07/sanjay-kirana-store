import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FaCrown, FaPhoneAlt, FaLock, FaCheckCircle, FaExclamationTriangle, FaArrowRight, FaShieldAlt } from "react-icons/fa";
import api, { getApiErrorMessage } from "../utils/api";
import { setSession, isOwner } from "../utils/auth";
import "./OwnerLogin.css";

function OwnerLogin() {
    const navigate = useNavigate();
    const otpInputRef = useRef(null);

    // If already logged in as Owner, redirect to owner dashboard
    useEffect(() => {
        if (isOwner()) {
            navigate("/owner/dashboard", { replace: true });
        }
    }, [navigate]);

    // Step 1: Send OTP to fixed Owner phone | Step 2: Enter 6-digit OTP
    const [step, setStep] = useState(1);
    const [challengeId, setChallengeId] = useState("");
    const [maskedPhone, setMaskedPhone] = useState("******3538");
    const [otp, setOtp] = useState("");
    const [loading, setLoading] = useState(false);
    const [timer, setTimer] = useState(0);
    const [errorMessage, setErrorMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    // Auto-focus OTP input in Step 2
    useEffect(() => {
        if (step === 2 && otpInputRef.current) {
            otpInputRef.current.focus();
        }
    }, [step]);

    // Resend countdown timer
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

    // Step 1: Send OTP to fixed Owner phone
    const handleSendOwnerOtp = async (e) => {
        if (e) e.preventDefault();
        setErrorMessage("");
        setSuccessMessage("");
        setLoading(true);

        try {
            const resp = await api.post("/auth/owner/send-otp", {});
            const { challenge_id, masked_phone, expires_in_seconds } = resp.data;
            if (challenge_id) {
                setChallengeId(challenge_id);
                setMaskedPhone(masked_phone || "******3538");
                setStep(2);
                setTimer(expires_in_seconds ? Math.min(expires_in_seconds, 60) : 60);
                setSuccessMessage(`Security OTP dispatched to store owner's registered phone (${masked_phone}).`);
            } else {
                setErrorMessage("Unexpected response from authentication server.");
            }
        } catch (err) {
            setErrorMessage(getApiErrorMessage(err, "Failed to send owner OTP. Please try again."));
        } finally {
            setLoading(false);
        }
    };

    // Step 2: Verify OTP and acquire Owner session
    const handleVerifyOwnerOtp = async (e) => {
        e.preventDefault();
        setErrorMessage("");
        setSuccessMessage("");

        const cleanOtp = otp.trim().replace(/\D/g, "");
        if (cleanOtp.length !== 6) {
            setErrorMessage("Please enter the complete 6-digit security OTP code.");
            return;
        }

        setLoading(true);
        try {
            const resp = await api.post("/auth/owner/verify-otp", {
                challenge_id: challengeId,
                otp: cleanOtp,
            });

            const { token, owner } = resp.data;
            if (token && owner) {
                setSession(token, owner);
                setSuccessMessage("Owner authentication successful! Accessing Store Governance Dashboard...");
                setTimeout(() => {
                    navigate("/owner/dashboard", { replace: true });
                }, 700);
            } else {
                setErrorMessage("Failed to acquire owner authentication token.");
            }
        } catch (err) {
            setErrorMessage(getApiErrorMessage(err, "Invalid or expired security code. Please check and try again."));
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="owner-login-page">
            <div className="owner-login-card">
                {/* Portal Badge */}
                <div className="owner-portal-badge">
                    <FaCrown className="crown-icon" />
                    <span>Store Owner Portal</span>
                </div>

                <div className="owner-login-header">
                    <h1>Sanjay Kirana Store</h1>
                    <p className="owner-subhead">
                        Supreme Owner Governance Access (Sanjay)
                    </p>
                    <p className="owner-instructions">
                        {step === 1
                            ? "Authentication requires verified SMS OTP sent to the fixed store owner mobile number (+91 9919193538). No password required."
                            : `Enter the 6-digit cryptographic verification code dispatched to ${maskedPhone}.`}
                    </p>
                </div>

                {/* Alerts */}
                {errorMessage && (
                    <div className="owner-alert error" role="alert">
                        <FaExclamationTriangle />
                        <span>{errorMessage}</span>
                    </div>
                )}

                {successMessage && (
                    <div className="owner-alert success" role="alert">
                        <FaCheckCircle />
                        <span>{successMessage}</span>
                    </div>
                )}

                {step === 1 ? (
                    <div className="owner-step1-pane">
                        <div className="owner-destination-box">
                            <FaPhoneAlt />
                            <div className="destination-text">
                                <span className="label">Registered Store Owner Phone</span>
                                <strong className="number">+91 9919193538 (Sanjay)</strong>
                            </div>
                            <span className="fixed-pill">Fixed Protected Destination</span>
                        </div>

                        <button
                            type="button"
                            className="owner-btn primary-btn"
                            onClick={handleSendOwnerOtp}
                            disabled={loading}
                        >
                            {loading ? (
                                "Dispatching OTP..."
                            ) : (
                                <>
                                    <span>Send Owner Login OTP</span>
                                    <FaArrowRight />
                                </>
                            )}
                        </button>
                    </div>
                ) : (
                    <form className="owner-login-form" onSubmit={handleVerifyOwnerOtp}>
                        <div className="form-group">
                            <label htmlFor="owner-otp">6-Digit Security OTP</label>
                            <input
                                id="owner-otp"
                                ref={otpInputRef}
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength="6"
                                placeholder="• • • • • •"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                required
                                className="otp-large-input"
                            />
                        </div>

                        <button
                            type="submit"
                            className="owner-btn primary-btn"
                            disabled={loading || otp.length !== 6}
                        >
                            {loading ? "Verifying Token..." : "Verify & Open Owner Dashboard"}
                        </button>

                        <div className="form-secondary-actions">
                            <button
                                type="button"
                                className="resend-link"
                                onClick={handleSendOwnerOtp}
                                disabled={timer > 0 || loading}
                            >
                                {timer > 0 ? `Resend OTP in ${timer}s` : "Resend Security Code"}
                            </button>

                            <button
                                type="button"
                                className="back-link"
                                onClick={() => {
                                    setStep(1);
                                    setOtp("");
                                    setErrorMessage("");
                                }}
                            >
                                ← Change Method
                            </button>
                        </div>
                    </form>
                )}

                {/* Footer Navigation */}
                <div className="owner-login-footer">
                    <Link to="/admin/login" className="footer-nav-link">
                        <FaShieldAlt /> Admin Login (Staff Portal)
                    </Link>
                    <span className="dot-sep">•</span>
                    <Link to="/" className="footer-nav-link">
                        Return to Store
                    </Link>
                </div>
            </div>
        </main>
    );
}

export default OwnerLogin;

