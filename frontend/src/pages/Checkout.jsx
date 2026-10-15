import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar/Navbar";
import Footer from "../components/Footer/Footer";
import { getProductImageUrl } from "../utils/image";
import api, { getApiErrorMessage } from "../utils/api";
import { getUser, isAuthenticated } from "../utils/auth";
import "./Checkout.css";

// Fallback Harraiya landmarks for instant, zero-cost location selection
const DEFAULT_LANDMARKS = [
    { id: "harraiya_chowk", name: "Harraiya Main Chowk / Bus Stand", latitude: 26.794500, longitude: 82.463000, distance_km: 0.1, is_eligible: true },
    { id: "purani_bazar", name: "Purani Bazar, Harraiya", latitude: 26.793800, longitude: 82.461200, distance_km: 0.1, is_eligible: true },
    { id: "tehsil_office", name: "Tehsil Complex / SDM Office", latitude: 26.797200, longitude: 82.461100, distance_km: 0.32, is_eligible: true },
    { id: "thana_road", name: "Harraiya Police Station (Thana)", latitude: 26.796000, longitude: 82.464500, distance_km: 0.3, is_eligible: true },
    { id: "chc_hospital", name: "Community Health Centre (CHC Hospital)", latitude: 26.798500, longitude: 82.458000, distance_km: 0.61, is_eligible: true },
    { id: "block_office", name: "Block Development Office (Vikas Khand)", latitude: 26.792000, longitude: 82.456000, distance_km: 0.66, is_eligible: true },
    { id: "nh27_bypass", name: "NH-27 Flyover / Bypass Crossing", latitude: 26.789500, longitude: 82.462500, distance_km: 0.54, is_eligible: true },
    { id: "babhnan_road", name: "Babhnan Road Crossing", latitude: 26.802000, longitude: 82.460000, distance_km: 0.87, is_eligible: true },
    { id: "belbhariya", name: "Belbhariya / Khasaha Village (~1.4 km - Eligible)", latitude: 26.805000, longitude: 82.470000, distance_km: 1.42, is_eligible: true },
    { id: "chhatauna", name: "Chhatauna Village (~2.6 km - Outside 2 km)", latitude: 26.812000, longitude: 82.445000, distance_km: 2.6, is_eligible: false },
    { id: "roopgarh", name: "Roopgarh Village (~3.5 km - Outside 2 km)", latitude: 26.772000, longitude: 82.448000, distance_km: 3.5, is_eligible: false },
    { id: "bardiha", name: "Bardiha Village (~4.2 km - Outside 2 km)", latitude: 26.828000, longitude: 82.472000, distance_km: 4.2, is_eligible: false },
];

function Checkout({ cart, setCart, wishlist = [], setOrders }) {
    const navigate = useNavigate();
    const currentUser = getUser();

    // Form state: prefill customer details if logged in
    const [address, setAddress] = useState({
        name: currentUser?.name || "",
        phone: currentUser?.phone || "",
        address: "",
        city: "Harraiya",
        pincode: "272155",
    });

    const [paymentMethod, setPaymentMethod] = useState("cod");

    // Delivery location verification state (2 km radius)
    const [landmarks, setLandmarks] = useState(DEFAULT_LANDMARKS);
    const [selectedLandmark, setSelectedLandmark] = useState("");
    const [verifiedLocation, setVerifiedLocation] = useState(null);
    const [isLocating, setIsLocating] = useState(false);
    const [locationNotice, setLocationNotice] = useState("");

    // UI state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [completedOrder, setCompletedOrder] = useState(null);
    const [idempotencyKey, setIdempotencyKey] = useState(() => "ord_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9));

    // Saved Addresses picker state (for logged-in customers)
    const [savedAddresses, setSavedAddresses] = useState([]);
    const [selectedSavedAddressId, setSelectedSavedAddressId] = useState(null);

    // Apply saved address to form and location verification
    const applySavedAddress = (addr) => {
        setSelectedSavedAddressId(addr.id);
        const fullAddr = [
            addr.street_address || addr.streetAddress || "",
            addr.landmark ? `Near ${addr.landmark}` : "",
            addr.locality || ""
        ].filter(Boolean).join(", ");

        setAddress({
            name: addr.recipient_name || addr.recipientName || "",
            phone: addr.phone || "",
            address: fullAddr,
            city: addr.city || "Harraiya",
            pincode: addr.pincode || "272155",
        });

        if (addr.delivery_latitude && addr.delivery_longitude) {
            setVerifiedLocation({
                latitude: Number(addr.delivery_latitude),
                longitude: Number(addr.delivery_longitude),
                is_eligible: true,
                distance_km: 0.5,
                source: "saved_address",
            });
            setSelectedLandmark("");
        }
    };

    // Fetch store landmarks dynamically from backend on mount
    useEffect(() => {
        let isMounted = true;
        api.get("/delivery/info")
            .then((res) => {
                if (isMounted && res.data?.landmarks?.length > 0) {
                    setLandmarks(res.data.landmarks);
                }
            })
            .catch((err) => {
                console.warn("Could not load backend delivery info, using curated presets:", err);
            });

        // Load saved addresses for logged-in customers
        if (isAuthenticated()) {
            api.get("/account/addresses")
                .then((res) => {
                    if (isMounted && Array.isArray(res.data) && res.data.length > 0) {
                        setSavedAddresses(res.data);
                        const defaultAddr = res.data.find((a) => a.is_default || a.isDefault) || res.data[0];
                        if (defaultAddr) {
                            applySavedAddress(defaultAddr);
                        }
                    }
                })
                .catch((err) => {
                    console.warn("Could not load customer saved addresses:", err);
                });
        }

        return () => {
            isMounted = false;
        };
    }, []);

    // Calculate totals based on current cart
    const subtotal = cart.reduce(
        (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0),
        0
    );

    const deliveryCharge =
        subtotal === 0
            ? 0
            : subtotal >= 500
                ? 0
                : 40;

    const total = subtotal + deliveryCharge;

    const totalItems = cart.reduce(
        (sum, item) => sum + (Number(item.quantity) || 0),
        0
    );

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setAddress((prev) => ({
            ...prev,
            [name]: value,
        }));
        if (errorMessage) {
            setErrorMessage("");
        }
    };

    // Handler 1: GPS Browser Location Detection
    const handleDetectGPS = () => {
        if (!navigator.geolocation) {
            setLocationNotice("Geolocation is not supported by your browser. Please select your nearest Harraiya landmark below.");
            return;
        }

        setIsLocating(true);
        setLocationNotice("Requesting device location to verify delivery radius...");
        setErrorMessage("");

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;

                try {
                    const response = await api.post("/delivery/validate", {
                        latitude: lat,
                        longitude: lon,
                    });

                    const data = response.data;
                    setVerifiedLocation({
                        latitude: lat,
                        longitude: lon,
                        distance_km: data.distance_km,
                        distance_meters: data.distance_meters,
                        is_eligible: data.is_eligible,
                        source: "gps",
                        message: data.message,
                    });

                    if (data.is_eligible) {
                        setLocationNotice(`GPS location verified: ${data.distance_km} km from Sanjay Kirana Store. Delivery available!`);
                    } else {
                        setLocationNotice(`Your location is ${data.distance_km} km away, which exceeds our 2 km delivery radius.`);
                    }
                } catch (error) {
                    const msg = getApiErrorMessage(error, "Failed to validate location with server.");
                    setLocationNotice(msg);
                } finally {
                    setIsLocating(false);
                }
            },
            (error) => {
                setIsLocating(false);
                let msg = "Could not detect location.";
                if (error.code === 1) {
                    msg = "Location permission denied. Please select your nearest Harraiya landmark below.";
                } else if (error.code === 2) {
                    msg = "Location position unavailable. Please choose your nearest Harraiya landmark below.";
                } else if (error.code === 3) {
                    msg = "Location request timed out. Please choose your nearest Harraiya landmark below.";
                }
                setLocationNotice(msg);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000,
            }
        );
    };

    // Handler 2: Harraiya Landmark Selection
    const handleLandmarkSelect = async (e) => {
        const landmarkId = e.target.value;
        setSelectedLandmark(landmarkId);
        if (!landmarkId) return;

        const found = landmarks.find((l) => l.id === landmarkId);
        if (!found) return;

        setIsLocating(true);
        setLocationNotice(`Checking distance for ${found.name}...`);
        setErrorMessage("");

        try {
            const response = await api.post("/delivery/validate", {
                latitude: found.latitude,
                longitude: found.longitude,
            });

            const data = response.data;
            setVerifiedLocation({
                latitude: found.latitude,
                longitude: found.longitude,
                distance_km: data.distance_km,
                distance_meters: data.distance_meters,
                is_eligible: data.is_eligible,
                source: "landmark",
                landmarkName: found.name,
                message: data.message,
            });

            if (data.is_eligible) {
                setLocationNotice(`Landmark selected: ${found.name} (${data.distance_km} km away). Delivery available!`);
                // Auto-fill delivery address if empty
                setAddress((prev) => {
                    if (!prev.address.trim()) {
                        return { ...prev, address: `Near ${found.name}` };
                    }
                    return prev;
                });
            } else {
                setLocationNotice(`${found.name} is ${data.distance_km} km away, outside our 2 km delivery radius.`);
            }
        } catch (error) {
            const msg = getApiErrorMessage(error, "Failed to validate landmark distance.");
            setLocationNotice(msg);
        } finally {
            setIsLocating(false);
        }
    };

    const validateForm = () => {
        if (!address.name.trim()) {
            return "Please enter your full name.";
        }
        if (!address.phone.trim()) {
            return "Please enter your phone number.";
        }
        if (address.phone.trim().replace(/\D/g, "").length < 10) {
            return "Please enter a valid 10-digit phone number.";
        }
        if (!verifiedLocation) {
            return "Please verify your delivery location using GPS or select a nearby Harraiya landmark to confirm you are within our 2 km service area.";
        }
        if (!verifiedLocation.is_eligible) {
            return `Your delivery location is outside our 2 km delivery radius (${verifiedLocation.distance_km} km away). We deliver within 2 km of Sanjay Kirana Store, Harraiya. For assistance, call 9919193538.`;
        }
        if (!address.address.trim()) {
            return "Please enter your delivery address.";
        }
        if (!address.city.trim()) {
            return "Please enter your city.";
        }
        if (!address.pincode.trim()) {
            return "Please enter your pincode.";
        }
        if (address.pincode.trim().length !== 6 || !/^\d{6}$/.test(address.pincode.trim())) {
            return "Please enter a valid 6-digit pincode.";
        }
        if (!paymentMethod) {
            return "Please select a payment method.";
        }
        if (cart.length === 0) {
            return "Your cart is empty. Please add products before placing an order.";
        }
        return null;
    };

    const handlePlaceOrder = async (e) => {
        e.preventDefault();
        if (isSubmitting) return;

        const validationError = validateForm();
        if (validationError) {
            setErrorMessage(validationError);
            return;
        }

        setErrorMessage("");
        setIsSubmitting(true);

        const orderPayload = {
            customer_name: address.name.trim(),
            customer_phone: address.phone.trim(),
            delivery_address: address.address.trim(),
            city: address.city.trim(),
            pincode: address.pincode.trim(),
            payment_method: paymentMethod,
            latitude: verifiedLocation?.latitude,
            longitude: verifiedLocation?.longitude,
            idempotency_key: idempotencyKey,
            items: cart.map((item) => ({
                product_id: parseInt(item.id, 10),
                quantity: parseInt(item.quantity, 10) || 1,
            })),
        };

        try {
            const response = await api.post("/orders", orderPayload, {
                headers: {
                    "Idempotency-Key": idempotencyKey
                }
            });

            if (response.status === 201 || response.status === 200) {
                const createdOrder = response.data.order;

                // Save order to history if handler provided
                if (typeof setOrders === "function") {
                    setOrders((prevOrders) => [createdOrder, ...(prevOrders || [])]);
                }

                // Clear the cart state only after confirmed commit
                setCart([]);

                // Set completed order to show in-page order-success screen
                setCompletedOrder(createdOrder);

                // Reset idempotency key for future checkouts
                setIdempotencyKey("ord_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9));
            }
        } catch (error) {
            console.error("Order placement failed:", error);
            const serverError = getApiErrorMessage(
                error,
                "Failed to place your order. Please check your details and try again."
            );
            setErrorMessage(serverError);
        } finally {
            setIsSubmitting(false);
        }
    };

    // 1. Order Success Screen
    if (completedOrder) {
        return (
            <>
                <Navbar cart={cart} wishlist={wishlist} />
                <div className="checkout-page">
                    <div className="order-success-container">
                        <div className="order-success-card">
                            <div className="success-icon-badge">✓</div>
                            <h1>Order Placed Successfully!</h1>
                            <p className="success-subtitle">
                                Thank you for shopping with Sanjay Kirana Store.
                            </p>

                            <div className="order-id-highlight">
                                <span>Order ID</span>
                                <strong>{completedOrder.orderId || completedOrder.order_id}</strong>
                            </div>

                            <div className="success-details-grid">
                                <div className="success-detail-box">
                                    <span>Total Amount</span>
                                    <strong>₹{completedOrder.total || completedOrder.total_amount}</strong>
                                </div>
                                <div className="success-detail-box">
                                    <span>Items Ordered</span>
                                    <strong>{completedOrder.totalItems || completedOrder.total_items} items</strong>
                                </div>
                                <div className="success-detail-box">
                                    <span>Payment Method</span>
                                    <strong>
                                        {completedOrder.paymentMethod === "upi" || completedOrder.payment_method === "upi"
                                            ? "UPI (Pay on Delivery)"
                                            : "Cash on Delivery (COD)"}
                                    </strong>
                                </div>
                                <div className="success-detail-box">
                                    <span>Status</span>
                                    <strong className="status-tag">{completedOrder.status || "Order Placed"}</strong>
                                </div>
                            </div>

                            {/* Delivery Summary */}
                            <div className="success-delivery-summary">
                                <h3>Delivery Details</h3>
                                <p><strong>{completedOrder.customerName || completedOrder.customer_name}</strong></p>
                                <p>{completedOrder.deliveryAddress || completedOrder.delivery_address}</p>
                                <p>{completedOrder.city} - {completedOrder.pincode}</p>
                                <p>Phone: {completedOrder.customerPhone || completedOrder.customer_phone}</p>
                                {(completedOrder.deliveryDistanceKm !== undefined && completedOrder.deliveryDistanceKm !== null) && (
                                    <p className="success-distance-pill">
                                        🛵 Verified Delivery Radius: <strong>{completedOrder.deliveryDistanceKm} km</strong> from Sanjay Kirana Store (Within 2 km service area)
                                    </p>
                                )}
                            </div>

                            {/* Order Items List */}
                            {completedOrder.items && completedOrder.items.length > 0 && (
                                <div className="success-items-list">
                                    <h3>Items Summary</h3>
                                    {completedOrder.items.map((item, idx) => (
                                        <div className="success-item-row" key={item.id || idx}>
                                            <div className="success-item-info">
                                                {item.image && (
                                                    <img src={getProductImageUrl(item.image)} alt={item.productName || item.name} />
                                                )}
                                                <div>
                                                    <h4>{item.productName || item.product_name || item.name}</h4>
                                                    <p>{item.size || item.product_size} • Qty: {item.quantity}</p>
                                                </div>
                                            </div>
                                            <strong>₹{item.totalPrice || item.total_price || (item.unitPrice * item.quantity)}</strong>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Estimated Delivery Information */}
                            <div className="success-delivery-estimate" style={{
                                background: "#f0fdf4",
                                border: "1px solid #bbf7d0",
                                color: "#166534",
                                padding: "14px 18px",
                                borderRadius: "10px",
                                marginBottom: "20px",
                                display: "flex",
                                alignItems: "center",
                                gap: "12px",
                                fontSize: "0.95rem",
                                fontWeight: "600",
                                textAlign: "left"
                            }}>
                                <span style={{ fontSize: "1.5rem" }}>⚡</span>
                                <div>
                                    <div style={{ color: "#166534", fontWeight: "700" }}>Estimated Delivery: Within 30–45 Minutes</div>
                                    <small style={{ color: "#15803d", fontWeight: "normal", display: "block", marginTop: "2px" }}>
                                        Express local delivery across Harraiya (within 2 km service radius)
                                    </small>
                                </div>
                            </div>

                            <div className="success-actions" style={{ display: "flex", gap: "14px", justifyContent: "center", flexWrap: "wrap", marginTop: "20px" }}>
                                <button
                                    className="track-order-btn"
                                    onClick={() => {
                                        const oid = completedOrder.orderId || completedOrder.order_id;
                                        const token = completedOrder.trackingToken || completedOrder.tracking_token;
                                        navigate(`/track-order/${oid}${token ? `?token=${encodeURIComponent(token)}` : ""}`);
                                    }}
                                    style={{
                                        background: "var(--color-primary, #176534)",
                                        color: "#ffffff",
                                        border: "none",
                                        padding: "15px 30px",
                                        fontSize: "1.05rem",
                                        fontWeight: "700",
                                        borderRadius: "12px",
                                        cursor: "pointer",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "8px",
                                        boxShadow: "0 4px 14px rgba(23, 101, 52, 0.25)"
                                    }}
                                >
                                    <span>📍</span>
                                    <span>Track Your Order</span>
                                </button>
                                <button
                                    className="continue-shopping-btn"
                                    onClick={() => navigate("/")}
                                    style={{
                                        background: "#f1f5f9",
                                        color: "#334155",
                                        border: "1px solid #cbd5e1",
                                        padding: "15px 28px",
                                        fontSize: "1.02rem",
                                        fontWeight: "600",
                                        borderRadius: "12px",
                                        cursor: "pointer"
                                    }}
                                >
                                    Continue Shopping
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <Footer />
            </>
        );
    }

    // 2. Empty Cart Screen
    if (cart.length === 0) {
        return (
            <>
                <Navbar cart={cart} wishlist={wishlist} />
                <div className="checkout-page">
                    <div className="checkout-empty">
                        <div className="empty-cart-icon">🛒</div>
                        <h2>Your cart is empty</h2>
                        <p>Add some products to your cart before proceeding to checkout.</p>
                        <Link to="/" className="continue-shopping-link">
                            Start Shopping
                        </Link>
                    </div>
                </div>
                <Footer />
            </>
        );
    }

    // 3. Checkout Form & Order Summary
    return (
        <>
            <Navbar cart={cart} wishlist={wishlist} />

            <div className="checkout-page">
                <div className="checkout-container">
                    <Link to="/cart" className="back-to-cart">
                        ← Back to Cart
                    </Link>

                    <h1>Checkout</h1>

                    {/* 2 km Delivery Area Customer Notice */}
                    <div className="checkout-delivery-notice-banner" role="region" aria-label="Service Area Notice">
                        <span className="notice-icon">🛵</span>
                        <p>
                            We deliver within a 2 km radius of Sanjay Kirana Store, Harraiya, Basti (PIN 272155). For assistance, call <a href="tel:+919919193538">9919193538</a>.
                        </p>
                    </div>

                    {errorMessage && (
                        <div className="checkout-error-banner" role="alert">
                            <span className="error-icon">⚠️</span>
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    <form className="checkout-layout" onSubmit={handlePlaceOrder}>
                        {/* LEFT COLUMN: Delivery & Payment Details */}
                        <div className="checkout-left">
                            {/* Card 1: Delivery Area Verification (2 km radius) */}
                            <div className="checkout-card location-verification-card">
                                <div className="card-header-flex">
                                    <h2>1. Delivery Area Verification</h2>
                                    <span className="radius-status-badge">2 km Radius</span>
                                </div>
                                <p className="location-intro-text">
                                    We deliver daily kirana essentials within a <strong>2 km radius</strong> of Sanjay Kirana Store, Harraiya (PIN 272155). Please verify your location below.
                                </p>

                                <div className="location-verification-grid">
                                    {/* Option A: Device GPS Detection */}
                                    <div className="location-action-box">
                                        <div className="action-box-info">
                                            <strong>Option A: Detect GPS Location</strong>
                                            <p>Measures exact straight-line distance using device GPS</p>
                                        </div>
                                        <button
                                            type="button"
                                            className="detect-gps-btn"
                                            onClick={handleDetectGPS}
                                            disabled={isLocating || isSubmitting}
                                        >
                                            {isLocating && verifiedLocation?.source === "gps" ? (
                                                <span className="btn-loading-content">
                                                    <span className="spinner"></span> Detecting Location...
                                                </span>
                                            ) : (
                                                "📍 Detect My Location (GPS)"
                                            )}
                                        </button>
                                    </div>

                                    {/* Option B: Local Harraiya Landmark / Village */}
                                    <div className="location-action-box">
                                        <div className="action-box-info">
                                            <strong>Option B: Select Nearest Harraiya Landmark</strong>
                                            <p>Fast offline selection for local markets & nearby villages</p>
                                        </div>
                                        <select
                                            id="landmark-select"
                                            className="landmark-dropdown"
                                            value={selectedLandmark}
                                            onChange={handleLandmarkSelect}
                                            disabled={isLocating || isSubmitting}
                                        >
                                            <option value="">-- Choose Your Nearest Landmark / Village --</option>
                                            {landmarks.map((lm) => (
                                                <option key={lm.id} value={lm.id}>
                                                    {lm.name} ({lm.distance_km !== undefined ? `${lm.distance_km} km` : "Harraiya"})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Verification Result Banner */}
                                {verifiedLocation && (
                                    <div
                                        className={`location-result-banner ${
                                            verifiedLocation.is_eligible ? "eligible" : "ineligible"
                                        }`}
                                        role="status"
                                    >
                                        <span className="result-icon">
                                            {verifiedLocation.is_eligible ? "✅" : "⚠️"}
                                        </span>
                                        <div className="result-text">
                                            <strong>
                                                {verifiedLocation.is_eligible
                                                    ? `Delivery Available! (${verifiedLocation.distance_km} km from store)`
                                                    : `Outside 2 km Delivery Area (${verifiedLocation.distance_km} km away)`}
                                            </strong>
                                            <p>
                                                {verifiedLocation.is_eligible ? (
                                                    <>Your location is within our 2.0 km delivery radius from Sanjay Kirana Store, Harraiya.</>
                                                ) : (
                                                    <>
                                                        We deliver within 2 km of Sanjay Kirana Store, Harraiya. For assistance or bulk orders, please call owner Sanjay at <a href="tel:+919919193538">9919193538</a>.
                                                    </>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {locationNotice && !verifiedLocation && (
                                    <div className="location-notice-info">
                                        <span>ℹ️</span>
                                        <p>{locationNotice}</p>
                                    </div>
                                )}
                            </div>

                            {/* Card 2: Delivery Address Section */}
                            <div className="checkout-card">
                                <h2>2. Delivery Information</h2>

                                {savedAddresses.length > 0 && (
                                    <div className="saved-addresses-picker-box">
                                        <div className="picker-title-row">
                                            <span className="picker-title">📍 Deliver to a Saved Address:</span>
                                            <Link to="/account?tab=addresses" className="manage-addr-link">
                                                Manage Saved Addresses →
                                            </Link>
                                        </div>
                                        <div className="saved-address-cards-row">
                                            {savedAddresses.map((sa) => (
                                                <div
                                                    key={sa.id}
                                                    className={`saved-picker-card ${selectedSavedAddressId === sa.id ? "selected" : ""}`}
                                                    onClick={() => applySavedAddress(sa)}
                                                >
                                                    <div className="picker-card-top">
                                                        <span className="picker-label">{sa.label || "Home"}</span>
                                                        {(sa.is_default || sa.isDefault) && <span className="picker-default-chip">Default</span>}
                                                    </div>
                                                    <strong className="picker-recipient">{sa.recipient_name || sa.recipientName}</strong>
                                                    <p className="picker-street">{sa.street_address || sa.streetAddress}</p>
                                                    <span className="picker-phone">📞 +91 {sa.phone}</span>
                                                </div>
                                            ))}
                                            <div
                                                className={`saved-picker-card new-address ${selectedSavedAddressId === "new" ? "selected" : ""}`}
                                                onClick={() => {
                                                    setSelectedSavedAddressId("new");
                                                    setAddress({
                                                        name: currentUser?.name || "",
                                                        phone: currentUser?.phone || "",
                                                        address: "",
                                                        city: "Harraiya",
                                                        pincode: "272155",
                                                    });
                                                }}
                                            >
                                                <div className="new-addr-content">
                                                    <span className="plus-icon">＋</span>
                                                    <strong>Enter a Different Address</strong>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="form-grid">
                                    <div className="form-group">
                                        <label htmlFor="name">
                                            Full Name <span className="required-star">*</span>
                                        </label>
                                        <input
                                            id="name"
                                            type="text"
                                            name="name"
                                            value={address.name}
                                            onChange={handleInputChange}
                                            placeholder="Enter your full name"
                                            disabled={isSubmitting}
                                            required
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label htmlFor="phone">
                                            Phone Number <span className="required-star">*</span>
                                        </label>
                                        <input
                                            id="phone"
                                            type="tel"
                                            name="phone"
                                            value={address.phone}
                                            onChange={handleInputChange}
                                            placeholder="10-digit mobile number"
                                            maxLength="10"
                                            disabled={isSubmitting}
                                            required
                                        />
                                    </div>

                                    <div className="form-group full-width">
                                        <label htmlFor="address">
                                            Delivery Address <span className="required-star">*</span>
                                        </label>
                                        <textarea
                                            id="address"
                                            name="address"
                                            value={address.address}
                                            onChange={handleInputChange}
                                            placeholder="House / Flat no., street, landmark, area"
                                            rows="3"
                                            disabled={isSubmitting}
                                            required
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label htmlFor="city">
                                            City / Town <span className="required-star">*</span>
                                        </label>
                                        <input
                                            id="city"
                                            type="text"
                                            name="city"
                                            value={address.city}
                                            onChange={handleInputChange}
                                            placeholder="Enter city (e.g., Harraiya, Basti)"
                                            disabled={isSubmitting}
                                            required
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label htmlFor="pincode">
                                            Pincode <span className="required-star">*</span>
                                        </label>
                                        <input
                                            id="pincode"
                                            type="text"
                                            name="pincode"
                                            value={address.pincode}
                                            onChange={handleInputChange}
                                            placeholder="6-digit pincode"
                                            maxLength="6"
                                            disabled={isSubmitting}
                                            required
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Card 3: Payment Method Section */}
                            <div className="checkout-card">
                                <h2>3. Payment Method</h2>

                                <div className="payment-options-list">
                                    <label className={`payment-option ${paymentMethod === "cod" ? "selected" : ""}`}>
                                        <input
                                            type="radio"
                                            name="paymentMethod"
                                            value="cod"
                                            checked={paymentMethod === "cod"}
                                            onChange={(e) => setPaymentMethod(e.target.value)}
                                            disabled={isSubmitting}
                                        />
                                        <div className="payment-option-text">
                                            <strong>Cash on Delivery (COD)</strong>
                                            <p>Pay with cash when your groceries arrive at your doorstep</p>
                                        </div>
                                    </label>

                                    <label className={`payment-option ${paymentMethod === "upi" ? "selected" : ""}`}>
                                        <input
                                            type="radio"
                                            name="paymentMethod"
                                            value="upi"
                                            checked={paymentMethod === "upi"}
                                            onChange={(e) => setPaymentMethod(e.target.value)}
                                            disabled={isSubmitting}
                                        />
                                        <div className="payment-option-text">
                                            <strong>UPI / QR on Delivery</strong>
                                            <p>Scan QR code or pay using Google Pay, PhonePe, Paytm upon delivery</p>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Order Summary */}
                        <div className="checkout-summary">
                            <h2>Order Summary</h2>

                            <div className="summary-items">
                                {cart.map((item) => (
                                    <div className="summary-item" key={item.id}>
                                        <div className="summary-item-img-wrap">
                                            <img
                                                src={getProductImageUrl(item.image)}
                                                alt={item.name}
                                                onError={(e) => {
                                                    e.target.style.display = "none";
                                                }}
                                            />
                                        </div>

                                        <div className="summary-item-details">
                                            <h4>{item.name}</h4>
                                            <p className="summary-item-meta">
                                                {item.size ? `${item.size} • ` : ""}
                                                Qty: {item.quantity} × ₹{item.price}
                                            </p>
                                        </div>

                                        <strong className="summary-item-total">
                                            ₹{(item.price * item.quantity).toFixed(2)}
                                        </strong>
                                    </div>
                                ))}
                            </div>

                            <div className="checkout-divider" />

                            <div className="summary-row">
                                <span>Items Subtotal ({totalItems})</span>
                                <span>₹{subtotal.toFixed(2)}</span>
                            </div>

                            <div className="summary-row">
                                <span>Delivery Fee</span>
                                <span className={deliveryCharge === 0 ? "free-delivery-badge" : ""}>
                                    {deliveryCharge === 0 ? "FREE" : `₹${deliveryCharge.toFixed(2)}`}
                                </span>
                            </div>

                            {subtotal > 0 && subtotal < 500 && (
                                <div className="delivery-tip">
                                    Add ₹{(500 - subtotal).toFixed(2)} more for <strong>FREE Delivery</strong> 🎉
                                </div>
                            )}

                            {subtotal >= 500 && (
                                <div className="delivery-tip free">
                                    🎉 You unlocked <strong>FREE Delivery!</strong>
                                </div>
                            )}

                            <div className="checkout-divider" />

                            <div className="checkout-total">
                                <span>Final Total</span>
                                <strong>₹{total.toFixed(2)}</strong>
                            </div>

                            <button
                                type="submit"
                                className="place-order-btn"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? (
                                    <span className="btn-loading-content">
                                        <span className="spinner"></span>
                                        Placing Order...
                                    </span>
                                ) : (
                                    `Place Order • ₹${total.toFixed(2)}`
                                )}
                            </button>

                            <p className="order-guarantee-note">
                                🔒 Safe & contactless delivery from Sanjay Kirana Store
                            </p>
                        </div>
                    </form>
                </div>
            </div>
            <Footer />
        </>
    );
}

export default Checkout;