import { useState } from "react";
import Navbar from "../components/Navbar/Navbar";
import Footer from "../components/Footer/Footer";
import "./Contact.css";

function Contact({ cart = [], wishlist = [] }) {
    const [form, setForm] = useState({
        name: "",
        phone: "",
        message: "",
    });

    const [errors, setErrors] = useState({});
    const [submissionPreview, setSubmissionPreview] = useState(null);

    const validate = () => {
        const newErrors = {};

        if (!form.name.trim()) {
            newErrors.name = "Please enter your full name.";
        }

        const phoneDigits = form.phone.trim().replace(/\D/g, "");
        if (!phoneDigits) {
            newErrors.phone = "Please enter your 10-digit mobile number.";
        } else if (!/^[6-9]\d{9}$/.test(phoneDigits)) {
            newErrors.phone = "Please enter a valid 10-digit Indian mobile number (starting with 6, 7, 8, or 9).";
        }

        if (!form.message.trim()) {
            newErrors.message = "Please write your message or inquiry.";
        } else if (form.message.trim().length < 5) {
            newErrors.message = "Message must be at least 5 characters long.";
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));

        // Clear error when user starts typing
        if (errors[name]) {
            setErrors((prev) => ({ ...prev, [name]: "" }));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!validate()) {
            return;
        }

        // Backend integration notice: No backend contact endpoint currently exists.
        // We display a transparent frontend submission preview.
        setSubmissionPreview({
            name: form.name.trim(),
            phone: form.phone.trim().replace(/\D/g, ""),
            message: form.message.trim(),
            timestamp: new Date().toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
            }),
        });
    };

    const handleReset = () => {
        setSubmissionPreview(null);
        setForm({ name: "", phone: "", message: "" });
        setErrors({});
    };

    return (
        <>
            <Navbar cart={cart} wishlist={wishlist} />

            <main className="contact-page">
                <div className="contact-header">
                    <h1>Contact Us</h1>
                    <p>
                        Welcome to Sanjay Kirana Store! We are your neighbourhood grocery store in Harraiya, Basti, Uttar Pradesh (PIN 272155).
                    </p>
                </div>

                {/* 2 km Delivery Area Notice Banner */}
                <div className="contact-delivery-banner" role="region" aria-label="Delivery Service Area">
                    <span className="banner-icon">🛵</span>
                    <p>
                        We deliver within a 2 km radius of Sanjay Kirana Store, Harraiya, Basti (PIN 272155). For assistance, call <a href="tel:+919919193538" className="banner-phone-link">9919193538</a>.
                    </p>
                </div>

                <div className="contact-layout">
                    {/* Store Information */}
                    <div className="contact-info">
                        <div className="contact-info-card">
                            <div className="contact-info-icon">🏪</div>
                            <div>
                                <h3>Store & Owner</h3>
                                <p><strong>Sanjay Kirana Store</strong></p>
                                <p className="contact-subtext">Owner: <strong>Sanjay</strong></p>
                            </div>
                        </div>

                        <div className="contact-info-card highlight-card">
                            <div className="contact-info-icon">📞</div>
                            <div>
                                <h3>Phone / WhatsApp</h3>
                                <p>
                                    <a href="tel:+919919193538" className="contact-phone-link">
                                        +91 9919193538
                                    </a>
                                </p>
                                <p className="contact-subtext">Tap to call directly for instant grocery support</p>
                            </div>
                        </div>

                        <div className="contact-info-card">
                            <div className="contact-info-icon">📍</div>
                            <div>
                                <h3>Store Location</h3>
                                <p>Harraiya, Basti</p>
                                <p>Uttar Pradesh, India — <strong>PIN 272155</strong></p>
                            </div>
                        </div>

                        <div className="contact-info-card">
                            <div className="contact-info-icon">🛵</div>
                            <div>
                                <h3>2 km Delivery Radius</h3>
                                <p>Local home delivery within 2,000 metres.</p>
                                <p className="contact-badge-free">FREE Delivery on orders ₹500+</p>
                            </div>
                        </div>
                    </div>

                    {/* Customer Inquiry Form */}
                    <div className="contact-form-card">
                        <h2>Send an Inquiry</h2>

                        {submissionPreview ? (
                            <div className="contact-preview-state">
                                <div className="preview-icon-badge">📋</div>
                                <h3>Inquiry Validated</h3>
                                <p className="preview-lead">
                                    Thank you, <strong>{submissionPreview.name}</strong>! Your inquiry details are shown below.
                                </p>

                                <div className="preview-summary-box">
                                    <div className="preview-summary-row">
                                        <span>Name:</span>
                                        <strong>{submissionPreview.name}</strong>
                                    </div>
                                    <div className="preview-summary-row">
                                        <span>Mobile:</span>
                                        <strong>+91 {submissionPreview.phone}</strong>
                                    </div>
                                    <div className="preview-summary-row">
                                        <span>Time:</span>
                                        <strong>{submissionPreview.timestamp}</strong>
                                    </div>
                                    <div className="preview-summary-row message-row">
                                        <span>Message:</span>
                                        <p>{submissionPreview.message}</p>
                                    </div>
                                </div>

                                <div className="backend-notice-box">
                                    <strong>ℹ️ Integration Notice:</strong>
                                    <p>
                                        The Flask backend server does not currently have a contact API endpoint configured.
                                        This form has validated your input locally on the frontend. Backend messaging integration can be attached once a contact endpoint is introduced.
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    className="contact-reset-btn"
                                    onClick={handleReset}
                                >
                                    Submit Another Inquiry
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="contact-form" noValidate>
                                <div className="form-group">
                                    <label htmlFor="name">
                                        Your Full Name <span className="req">*</span>
                                    </label>
                                    <input
                                        id="name"
                                        type="text"
                                        name="name"
                                        value={form.name}
                                        onChange={handleChange}
                                        placeholder="e.g. Rahul Sharma"
                                        className={errors.name ? "input-error" : ""}
                                    />
                                    {errors.name && (
                                        <span className="field-error-text">{errors.name}</span>
                                    )}
                                </div>

                                <div className="form-group">
                                    <label htmlFor="phone">
                                        Indian Mobile Number (10 digits) <span className="req">*</span>
                                    </label>
                                    <div className="phone-input-wrapper">
                                        <span className="phone-prefix">+91</span>
                                        <input
                                            id="phone"
                                            type="tel"
                                            name="phone"
                                            value={form.phone}
                                            onChange={handleChange}
                                            placeholder="9876543210"
                                            maxLength={10}
                                            className={errors.phone ? "input-error" : ""}
                                        />
                                    </div>
                                    {errors.phone && (
                                        <span className="field-error-text">{errors.phone}</span>
                                    )}
                                </div>

                                <div className="form-group">
                                    <label htmlFor="message">
                                        Message / Inquiry <span className="req">*</span>
                                    </label>
                                    <textarea
                                        id="message"
                                        name="message"
                                        value={form.message}
                                        onChange={handleChange}
                                        placeholder="Ask about product availability, bulk grocery orders, or delivery timing..."
                                        rows={4}
                                        className={errors.message ? "input-error" : ""}
                                    />
                                    {errors.message && (
                                        <span className="field-error-text">{errors.message}</span>
                                    )}
                                </div>

                                <button type="submit" className="contact-submit-btn">
                                    📨 Submit Inquiry
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </main>
            <Footer />
        </>
    );
}

export default Contact;
