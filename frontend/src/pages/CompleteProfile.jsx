import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
    FaUser,
    FaMapMarkerAlt,
    FaPhoneAlt,
    FaCheckCircle,
    FaShieldAlt,
    FaTruck,
    FaArrowRight,
    FaExclamationTriangle,
} from "react-icons/fa";
import Navbar from "../components/Navbar/Navbar";
import Footer from "../components/Footer/Footer";
import api, { getApiErrorMessage } from "../utils/api";
import { getUser, updateUser, isAuthenticated } from "../utils/auth";
import "./CompleteProfile.css";

export default function CompleteProfile({ cart = [], wishlist = [] }) {
    const navigate = useNavigate();
    const location = useLocation();
    const currentUser = getUser();

    // Destination after onboarding (e.g. /checkout or /)
    const destination = location.state?.from || "/";

    // Form states
    const [name, setName] = useState(currentUser?.name || "");
    const [phone] = useState(currentUser?.phone || "");
    const [streetAddress, setStreetAddress] = useState("");
    const [landmark, setLandmark] = useState("");
    const [locality, setLocality] = useState("");
    const [city, setCity] = useState("Harraiya");
    const [state, setState] = useState("Uttar Pradesh");
    const [pincode, setPincode] = useState("272155");

    // UI Feedback
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    // If unauthenticated or already complete, handle early navigation
    useEffect(() => {
        if (!isAuthenticated()) {
            navigate("/login", { state: { from: location.pathname }, replace: true });
            return;
        }
        if (currentUser?.profile_completed === true) {
            navigate(destination, { replace: true });
        }
    }, [currentUser, navigate, destination, location.pathname]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMessage("");
        setSuccessMessage("");

        const cleanName = name.trim();
        const cleanStreet = streetAddress.trim();
        const cleanCity = city.trim();
        const cleanPin = pincode.trim().replace(/\D/g, "");

        if (!cleanName || cleanName.length < 2) {
            setErrorMessage("Please enter your full name (minimum 2 characters).");
            return;
        }

        if (!cleanStreet || cleanStreet.length < 5) {
            setErrorMessage("Please enter your detailed house/building and street address.");
            return;
        }

        if (!cleanCity) {
            setErrorMessage("City is required.");
            return;
        }

        if (cleanPin.length !== 6) {
            setErrorMessage("Please enter a valid 6-digit Indian PIN code.");
            return;
        }

        setLoading(true);

        try {
            const payload = {
                name: cleanName,
                street_address: cleanStreet,
                landmark: landmark.trim(),
                locality: locality.trim(),
                city: cleanCity,
                state: state.trim() || "Uttar Pradesh",
                pincode: cleanPin,
                label: "Home",
            };

            const resp = await api.post("/account/complete-profile", payload);

            if (resp.status === 201 || resp.data?.user) {
                // Synchronize updated user profile across application
                updateUser({
                    name: resp.data.user.name,
                    profile_completed: true,
                    is_new_user: false,
                });

                setSuccessMessage("Profile & delivery address saved! Redirecting...");
                setTimeout(() => {
                    navigate(destination, { replace: true });
                }, 800);
            } else {
                setErrorMessage("Unable to save profile details. Please try again.");
            }
        } catch (err) {
            console.error("Complete profile error:", err);
            setErrorMessage(getApiErrorMessage(err, "Failed to save profile. Please check your entries."));
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Navbar cart={cart} wishlist={wishlist} />

            <main className="complete-profile-page">
                <div className="complete-profile-card">
                    {/* Welcome Banner */}
                    <div className="onboarding-header">
                        <div className="onboarding-badge">
                            <FaShieldAlt /> First-Time Customer Setup
                        </div>
                        <h1>Complete Your Delivery Profile</h1>
                        <p>
                            Welcome to <strong>Sanjay Kirana Store</strong>! Please share your name and delivery address so we can bring daily kirana essentials directly to your doorstep in Harraiya.
                        </p>
                    </div>

                    {/* Alert Messages */}
                    {errorMessage && (
                        <div className="onboarding-alert error" role="alert">
                            <FaExclamationTriangle />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {successMessage && (
                        <div className="onboarding-alert success" role="alert">
                            <FaCheckCircle />
                            <span>{successMessage}</span>
                        </div>
                    )}

                    <form className="onboarding-form" onSubmit={handleSubmit} noValidate>
                        {/* Section 1: Customer Identity */}
                        <div className="form-section">
                            <div className="section-title">
                                <FaUser />
                                <h2>1. Personal Details</h2>
                            </div>

                            <div className="form-grid-2">
                                <div className="form-group">
                                    <label htmlFor="customer_name">
                                        Full Name <span className="req-star">*</span>
                                    </label>
                                    <input
                                        id="customer_name"
                                        type="text"
                                        placeholder="e.g. Ramesh Kumar"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        maxLength="150"
                                        required
                                        autoFocus
                                    />
                                    <span className="field-hint">This name will appear on your delivery receipts.</span>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="customer_phone">
                                        Verified Mobile Number
                                    </label>
                                    <div className="readonly-phone-wrapper">
                                        <FaPhoneAlt className="phone-icon" />
                                        <input
                                            id="customer_phone"
                                            type="text"
                                            value={`+91 ${phone || "—"}`}
                                            readOnly
                                            className="readonly-input"
                                        />
                                        <span className="verified-pill">
                                            <FaCheckCircle /> Verified via OTP
                                        </span>
                                    </div>
                                    <span className="field-hint">Phone number verified via SMS OTP.</span>
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Delivery Address */}
                        <div className="form-section">
                            <div className="section-title">
                                <FaMapMarkerAlt />
                                <h2>2. Primary Delivery Address</h2>
                            </div>

                            <div className="form-group full-width">
                                <label htmlFor="street_address">
                                    House / Flat No., Building & Street <span className="req-star">*</span>
                                </label>
                                <textarea
                                    id="street_address"
                                    rows="2"
                                    placeholder="e.g. House No. 24, Near Old Post Office, Station Road"
                                    value={streetAddress}
                                    onChange={(e) => setStreetAddress(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="form-grid-2">
                                <div className="form-group">
                                    <label htmlFor="landmark">
                                        Landmark <span className="opt-tag">(Optional)</span>
                                    </label>
                                    <input
                                        id="landmark"
                                        type="text"
                                        placeholder="e.g. Opposite Shiv Mandir"
                                        value={landmark}
                                        onChange={(e) => setLandmark(e.target.value)}
                                        maxLength="200"
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="locality">
                                        Locality / Ward <span className="opt-tag">(Optional)</span>
                                    </label>
                                    <input
                                        id="locality"
                                        type="text"
                                        placeholder="e.g. Purani Bazar"
                                        value={locality}
                                        onChange={(e) => setLocality(e.target.value)}
                                        maxLength="150"
                                    />
                                </div>
                            </div>

                            <div className="form-grid-3">
                                <div className="form-group">
                                    <label htmlFor="city">
                                        Town / City <span className="req-star">*</span>
                                    </label>
                                    <input
                                        id="city"
                                        type="text"
                                        value={city}
                                        onChange={(e) => setCity(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="state">
                                        State <span className="req-star">*</span>
                                    </label>
                                    <input
                                        id="state"
                                        type="text"
                                        value={state}
                                        onChange={(e) => setState(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="pincode">
                                        PIN Code <span className="req-star">*</span>
                                    </label>
                                    <input
                                        id="pincode"
                                        type="text"
                                        value={pincode}
                                        onChange={(e) => setPincode(e.target.value)}
                                        maxLength="6"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Delivery Notice */}
                        <div className="delivery-radius-notice">
                            <FaTruck />
                            <span>
                                Sanjay Kirana Store delivers strictly within our local <strong>2 km delivery radius</strong> in Harraiya (Basti). Orders outside this area cannot be dispatched.
                            </span>
                        </div>

                        {/* Submit Action */}
                        <div className="form-submit-row">
                            <button
                                type="submit"
                                className="onboarding-submit-btn"
                                disabled={loading}
                            >
                                {loading ? (
                                    "Saving Profile..."
                                ) : (
                                    <>
                                        <span>Save & Continue Shopping</span>
                                        <FaArrowRight />
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </main>

            <Footer />
        </>
    );
}

