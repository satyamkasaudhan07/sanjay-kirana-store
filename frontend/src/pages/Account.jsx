import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
    FaUser,
    FaBoxOpen,
    FaMapMarkerAlt,
    FaStar,
    FaEdit,
    FaTrashAlt,
    FaPlus,
    FaCheckCircle,
    FaClock,
    FaShoppingBag,
    FaRedo,
    FaExclamationTriangle,
    FaTimes,
    FaPhoneAlt,
    FaShieldAlt
} from "react-icons/fa";
import Navbar from "../components/Navbar/Navbar";
import Footer from "../components/Footer/Footer";
import api, { getApiErrorMessage } from "../utils/api";
import { getUser, isAuthenticated, setSession, updateUser } from "../utils/auth";
import { getProductImageUrl } from "../utils/image";
import "./Account.css";

const TABS = [
    { id: "overview", label: "Overview & Profile", icon: FaUser },
    { id: "orders", label: "My Orders", icon: FaBoxOpen },
    { id: "addresses", label: "Saved Addresses", icon: FaMapMarkerAlt },
    { id: "reviews", label: "My Reviews", icon: FaStar },
];

export default function Account({ cart = [], setCart, wishlist = [], setWishlist }) {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const currentUser = getUser();

    // Active Tab state (synced with URL ?tab=)
    const initialTab = searchParams.get("tab") || "overview";
    const [activeTab, setActiveTab] = useState(initialTab);

    // Profile state
    const [profile, setProfile] = useState(null);
    const [isEditingName, setIsEditingName] = useState(false);
    const [editNameVal, setEditNameVal] = useState("");
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileMessage, setProfileMessage] = useState({ text: "", type: "" });

    // Orders state
    const [orders, setOrders] = useState([]);
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [orderFilter, setOrderFilter] = useState("all");
    const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);

    // Reorder state
    const [reorderLoading, setReorderLoading] = useState(false);
    const [reorderPreviewData, setReorderPreviewData] = useState(null);

    // Addresses state
    const [addresses, setAddresses] = useState([]);
    const [addressesLoading, setAddressesLoading] = useState(false);
    const [showAddressModal, setShowAddressModal] = useState(false);
    const [editingAddressId, setEditingAddressId] = useState(null);
    const [addressForm, setAddressForm] = useState({
        recipient_name: "",
        phone: "",
        street_address: "",
        landmark: "",
        locality: "",
        city: "Harraiya",
        state: "Uttar Pradesh",
        pincode: "272155",
        label: "Home",
        is_default: false,
    });
    const [addressSaving, setAddressSaving] = useState(false);
    const [addressError, setAddressError] = useState("");

    // Reviews state
    const [reviews, setReviews] = useState([]);
    const [reviewsLoading, setReviewsLoading] = useState(false);
    const [editingReview, setEditingReview] = useState(null);
    const [editRatingVal, setEditRatingVal] = useState(5);
    const [editTextVal, setEditTextVal] = useState("");
    const [reviewSaving, setReviewSaving] = useState(false);

    // Sync tab with URL
    const handleTabChange = (tabId) => {
        setActiveTab(tabId);
        setSearchParams({ tab: tabId });
        setProfileMessage({ text: "", type: "" });
    };

    // -----------------------------------------------------------------------
    // Fetch Profile & Data on Mount / Tab Change
    // -----------------------------------------------------------------------
    const fetchProfile = async () => {
        try {
            const res = await api.get("/account/profile");
            setProfile(res.data);
            setEditNameVal(res.data.name || "");
            // Update auth session if name updated
            if (currentUser && res.data.name) {
                setSession(null, { ...currentUser, name: res.data.name });
            }
        } catch (err) {
            console.error("Failed to fetch customer profile:", err);
        }
    };

    const fetchOrders = async () => {
        setOrdersLoading(true);
        try {
            const res = await api.get("/orders");
            if (Array.isArray(res.data)) {
                setOrders(res.data);
            }
        } catch (err) {
            console.error("Failed to fetch customer orders:", err);
        } finally {
            setOrdersLoading(false);
        }
    };

    const fetchAddresses = async () => {
        setAddressesLoading(true);
        try {
            const res = await api.get("/account/addresses");
            if (Array.isArray(res.data)) {
                setAddresses(res.data);
            }
        } catch (err) {
            console.error("Failed to fetch addresses:", err);
        } finally {
            setAddressesLoading(false);
        }
    };

    const fetchReviews = async () => {
        setReviewsLoading(true);
        try {
            const res = await api.get("/account/reviews");
            if (Array.isArray(res.data)) {
                setReviews(res.data);
            }
        } catch (err) {
            console.error("Failed to fetch customer reviews:", err);
        } finally {
            setReviewsLoading(false);
        }
    };

    useEffect(() => {
        if (!isAuthenticated()) {
            navigate("/login");
            return;
        }
        fetchProfile();
        fetchOrders();
        fetchAddresses();
        fetchReviews();
    }, [navigate]);

    // -----------------------------------------------------------------------
    // Profile Actions
    // -----------------------------------------------------------------------
    const handleSaveProfile = async (e) => {
        e.preventDefault();
        setProfileSaving(true);
        setProfileMessage({ text: "", type: "" });

        try {
            const res = await api.put("/account/profile", {
                name: editNameVal.trim(),
            });
            const updatedName = res.data.profile.name;
            setProfile((prev) => ({ ...prev, name: updatedName }));
            setIsEditingName(false);
            setProfileMessage({ text: "Profile name updated successfully!", type: "success" });
            updateUser({ name: updatedName });
        } catch (err) {
            const msg = getApiErrorMessage(err, "Failed to update profile name.");
            setProfileMessage({ text: msg, type: "error" });
        } finally {
            setProfileSaving(false);
        }
    };

    // -----------------------------------------------------------------------
    // Reorder Actions
    // -----------------------------------------------------------------------
    const handleInitiateReorder = async (orderId) => {
        setReorderLoading(true);
        try {
            const res = await api.post(`/account/orders/${orderId}/reorder-preview`);
            setReorderPreviewData(res.data);
        } catch (err) {
            const msg = getApiErrorMessage(err, "Unable to verify reorder items.");
            alert(msg);
        } finally {
            setReorderLoading(false);
        }
    };

    const handleConfirmReorder = () => {
        if (!reorderPreviewData || !reorderPreviewData.items) return;

        // Collect available items
        const availableItems = reorderPreviewData.items.filter((it) => it.is_available);
        if (availableItems.length === 0) {
            alert("None of the items in this order are currently available in stock.");
            setReorderPreviewData(null);
            return;
        }

        // Merge into current cart
        let updatedCart = [...cart];
        availableItems.forEach((reorderItem) => {
            const existingIdx = updatedCart.findIndex((c) => c.id === reorderItem.product_id);
            const qtyToAdd = reorderItem.requested_quantity || 1;

            if (existingIdx > -1) {
                const maxStock = reorderItem.available_stock || 99;
                const newQty = Math.min(updatedCart[existingIdx].quantity + qtyToAdd, maxStock);
                updatedCart[existingIdx] = {
                    ...updatedCart[existingIdx],
                    quantity: newQty,
                    price: reorderItem.current_price,
                };
            } else {
                updatedCart.push({
                    id: reorderItem.product_id,
                    name: reorderItem.name,
                    price: reorderItem.current_price,
                    image: reorderItem.image,
                    size: reorderItem.size,
                    stock: reorderItem.available_stock,
                    quantity: qtyToAdd,
                });
            }
        });

        if (typeof setCart === "function") {
            setCart(updatedCart);
        }
        setReorderPreviewData(null);
        navigate("/cart");
    };

    // -----------------------------------------------------------------------
    // Address Actions
    // -----------------------------------------------------------------------
    const openAddAddressModal = () => {
        setEditingAddressId(null);
        setAddressForm({
            recipient_name: profile?.name || "",
            phone: profile?.phone || "",
            street_address: "",
            landmark: "",
            locality: "",
            city: "Harraiya",
            state: "Uttar Pradesh",
            pincode: "272155",
            label: "Home",
            is_default: addresses.length === 0,
        });
        setAddressError("");
        setShowAddressModal(true);
    };

    const openEditAddressModal = (addr) => {
        setEditingAddressId(addr.id);
        setAddressForm({
            recipient_name: addr.recipient_name || addr.recipientName || "",
            phone: addr.phone || "",
            street_address: addr.street_address || addr.streetAddress || "",
            landmark: addr.landmark || "",
            locality: addr.locality || "",
            city: addr.city || "Harraiya",
            state: addr.state || "Uttar Pradesh",
            pincode: addr.pincode || "272155",
            label: addr.label || "Home",
            is_default: Boolean(addr.is_default || addr.isDefault),
        });
        setAddressError("");
        setShowAddressModal(true);
    };

    const handleSaveAddress = async (e) => {
        e.preventDefault();
        setAddressSaving(true);
        setAddressError("");

        try {
            if (editingAddressId) {
                const res = await api.put(`/account/addresses/${editingAddressId}`, addressForm);
                setAddresses((prev) =>
                    prev.map((a) => (a.id === editingAddressId ? res.data : a.is_default && res.data.is_default ? { ...a, is_default: false } : a))
                );
            } else {
                const res = await api.post("/account/addresses", addressForm);
                if (res.data.is_default) {
                    setAddresses((prev) => [res.data, ...prev.map((a) => ({ ...a, is_default: false }))]);
                } else {
                    setAddresses((prev) => [...prev, res.data]);
                }
            }
            setShowAddressModal(false);
            fetchProfile(); // update count
        } catch (err) {
            setAddressError(getApiErrorMessage(err, "Failed to save address."));
        } finally {
            setAddressSaving(false);
        }
    };

    const handleDeleteAddress = async (addressId) => {
        if (!window.confirm("Are you sure you want to delete this delivery address?")) return;
        try {
            await api.delete(`/account/addresses/${addressId}`);
            fetchAddresses();
            fetchProfile();
        } catch (err) {
            alert(getApiErrorMessage(err, "Failed to delete address."));
        }
    };

    const handleSetDefaultAddress = async (addressId) => {
        try {
            await api.patch(`/account/addresses/${addressId}/default`);
            setAddresses((prev) =>
                prev.map((a) => ({
                    ...a,
                    is_default: a.id === addressId,
                }))
            );
        } catch (err) {
            alert(getApiErrorMessage(err, "Failed to set default address."));
        }
    };

    // -----------------------------------------------------------------------
    // Review Actions
    // -----------------------------------------------------------------------
    const openEditReviewModal = (rev) => {
        setEditingReview(rev);
        setEditRatingVal(rev.rating || 5);
        setEditTextVal(rev.review_text || rev.reviewText || "");
    };

    const handleSaveReview = async (e) => {
        e.preventDefault();
        if (!editingReview) return;
        setReviewSaving(true);

        try {
            const res = await api.put(`/account/reviews/${editingReview.id}`, {
                rating: editRatingVal,
                review_text: editTextVal.trim(),
            });
            setReviews((prev) =>
                prev.map((r) =>
                    r.id === editingReview.id
                        ? { ...r, rating: res.data.review.rating, review_text: res.data.review.review_text }
                        : r
                )
            );
            setEditingReview(null);
        } catch (err) {
            alert(getApiErrorMessage(err, "Failed to update review."));
        } finally {
            setReviewSaving(false);
        }
    };

    const handleDeleteReview = async (reviewId) => {
        if (!window.confirm("Are you sure you want to delete this product review?")) return;
        try {
            await api.delete(`/account/reviews/${reviewId}`);
            setReviews((prev) => prev.filter((r) => r.id !== reviewId));
        } catch (err) {
            alert(getApiErrorMessage(err, "Failed to delete review."));
        }
    };

    // -----------------------------------------------------------------------
    // Filtered Orders
    // -----------------------------------------------------------------------
    const filteredOrders = useMemo(() => {
        if (orderFilter === "all") return orders;
        return orders.filter((o) => {
            const status = (o.status || "").toLowerCase();
            if (orderFilter === "placed") return status.includes("placed");
            if (orderFilter === "confirmed") return status.includes("confirmed");
            if (orderFilter === "delivered") return status.includes("delivered");
            if (orderFilter === "cancelled") return status.includes("cancel");
            return true;
        });
    }, [orders, orderFilter]);

    const formatDate = (dateStr) => {
        if (!dateStr) return "Recently";
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return String(dateStr);
            return d.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
            });
        } catch {
            return String(dateStr);
        }
    };

    const formatDateTime = (dateStr) => {
        if (!dateStr) return "Recently";
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return String(dateStr);
            return d.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            });
        } catch {
            return String(dateStr);
        }
    };

    const getStatusBadgeClass = (statusStr) => {
        const s = (statusStr || "").toLowerCase();
        if (s.includes("delivered")) return "status-badge delivered";
        if (s.includes("cancel")) return "status-badge cancelled";
        if (s.includes("confirmed")) return "status-badge confirmed";
        return "status-badge placed";
    };

    return (
        <>
            <Navbar cart={cart} wishlist={wishlist} />

            <main className="account-page">
                <div className="account-container">
                    {/* Top Profile Header Card */}
                    <div className="account-hero-card">
                        <div className="hero-avatar">
                            <FaUser />
                        </div>
                        <div className="hero-info">
                            <div className="hero-name-row">
                                <h1>{profile?.name || currentUser?.name || "Customer"}</h1>
                                <span className="verified-badge">
                                    <FaShieldAlt /> Verified Customer
                                </span>
                            </div>
                            <div className="hero-meta-row">
                                <span className="hero-meta-item">
                                    <FaPhoneAlt /> +91 {profile?.phone || currentUser?.phone || "—"}
                                </span>
                                {profile?.created_at && (
                                    <span className="hero-meta-item">
                                        <FaClock /> Member since {formatDate(profile.created_at)}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Quick Metrics */}
                        <div className="hero-stats-group">
                            <div className="hero-stat-card" onClick={() => handleTabChange("orders")}>
                                <span className="stat-num">{orders.length}</span>
                                <span className="stat-label">Orders</span>
                            </div>
                            <div className="hero-stat-card" onClick={() => handleTabChange("addresses")}>
                                <span className="stat-num">{addresses.length}</span>
                                <span className="stat-label">Addresses</span>
                            </div>
                            <div className="hero-stat-card" onClick={() => handleTabChange("reviews")}>
                                <span className="stat-num">{reviews.length}</span>
                                <span className="stat-label">Reviews</span>
                            </div>
                        </div>
                    </div>

                    {/* Main Layout: Tabs + Content */}
                    <div className="account-layout">
                        {/* Sidebar Navigation */}
                        <aside className="account-sidebar">
                            <nav className="account-nav">
                                {TABS.map((tab) => {
                                    const IconComponent = tab.icon;
                                    const isActive = activeTab === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            className={`account-nav-btn ${isActive ? "active" : ""}`}
                                            onClick={() => handleTabChange(tab.id)}
                                        >
                                            <IconComponent className="nav-btn-icon" />
                                            <span>{tab.label}</span>
                                        </button>
                                    );
                                })}
                            </nav>
                        </aside>

                        {/* Right Content Area */}
                        <div className="account-content-pane">
                            {/* TAB 1: OVERVIEW & PROFILE */}
                            {activeTab === "overview" && (
                                <div className="account-section">
                                    <div className="section-header">
                                        <h2>Account Overview & Profile</h2>
                                        <p>Manage your personal profile and view recent activity at Sanjay Kirana Store.</p>
                                    </div>

                                    {profileMessage.text && (
                                        <div className={`account-alert ${profileMessage.type}`}>
                                            {profileMessage.type === "success" ? <FaCheckCircle /> : <FaExclamationTriangle />}
                                            <span>{profileMessage.text}</span>
                                        </div>
                                    )}

                                    {/* Personal Profile Card */}
                                    <div className="account-card profile-details-card">
                                        <div className="card-title-row">
                                            <h3>Personal Information</h3>
                                            {!isEditingName && (
                                                <button
                                                    type="button"
                                                    className="account-action-link"
                                                    onClick={() => setIsEditingName(true)}
                                                >
                                                    <FaEdit /> Edit Name
                                                </button>
                                            )}
                                        </div>

                                        {isEditingName ? (
                                            <form onSubmit={handleSaveProfile} className="edit-name-form">
                                                <div className="form-group">
                                                    <label htmlFor="edit_name">Your Name</label>
                                                    <input
                                                        id="edit_name"
                                                        type="text"
                                                        value={editNameVal}
                                                        onChange={(e) => setEditNameVal(e.target.value)}
                                                        placeholder="Enter your full name"
                                                        maxLength="150"
                                                        required
                                                    />
                                                </div>
                                                <div className="form-actions-inline">
                                                    <button type="submit" className="save-btn" disabled={profileSaving}>
                                                        {profileSaving ? "Saving..." : "Save Changes"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="cancel-btn"
                                                        onClick={() => {
                                                            setIsEditingName(false);
                                                            setEditNameVal(profile?.name || "");
                                                        }}
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </form>
                                        ) : (
                                            <div className="profile-fields-grid">
                                                <div className="profile-field">
                                                    <span className="field-label">Full Name</span>
                                                    <strong className="field-val">{profile?.name || "Not set"}</strong>
                                                </div>
                                                <div className="profile-field">
                                                    <span className="field-label">Verified Mobile Number</span>
                                                    <div className="phone-verified-display">
                                                        <strong className="field-val">+91 {profile?.phone || "—"}</strong>
                                                        <span className="verified-pill">
                                                            <FaCheckCircle /> Verified
                                                        </span>
                                                    </div>
                                                    <p className="phone-notice-note">
                                                        Mobile number is tied to your login OTP and cannot be modified directly.
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Recent Order Preview Card */}
                                    <div className="account-card">
                                        <div className="card-title-row">
                                            <h3>Most Recent Order</h3>
                                            {orders.length > 0 && (
                                                <button
                                                    type="button"
                                                    className="account-action-link"
                                                    onClick={() => handleTabChange("orders")}
                                                >
                                                    View All Orders ({orders.length}) →
                                                </button>
                                            )}
                                        </div>

                                        {orders.length > 0 ? (
                                            <div className="recent-order-box">
                                                <div className="recent-order-header">
                                                    <div>
                                                        <span className="order-id-tag">#{orders[0].orderId || orders[0].order_id}</span>
                                                        <span className="order-date-text">Placed on {formatDateTime(orders[0].createdAt || orders[0].created_at)}</span>
                                                    </div>
                                                    <span className={getStatusBadgeClass(orders[0].status)}>
                                                        {orders[0].status || "Order Placed"}
                                                    </span>
                                                </div>
                                                <div className="recent-order-summary">
                                                    <span>Total: <strong>₹{orders[0].total || orders[0].totalAmount || orders[0].total_amount}</strong> ({orders[0].totalItems || orders[0].total_items || (orders[0].items ? orders[0].items.length : 1)} items)</span>
                                                    <button
                                                        type="button"
                                                        className="reorder-btn-small"
                                                        onClick={() => handleInitiateReorder(orders[0].orderId || orders[0].order_id)}
                                                        disabled={reorderLoading}
                                                    >
                                                        <FaRedo /> Reorder
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="empty-inline-state">
                                                <FaShoppingBag className="empty-icon" />
                                                <p>You haven't placed any orders yet.</p>
                                                <Link to="/products" className="shop-now-btn">
                                                    Start Shopping in Harraiya
                                                </Link>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* TAB 2: MY ORDERS */}
                            {activeTab === "orders" && (
                                <div className="account-section">
                                    <div className="section-header">
                                        <h2>My Orders</h2>
                                        <p>Track current orders, inspect previous receipts, or quickly reorder staples.</p>
                                    </div>

                                    {/* Filter Pills */}
                                    <div className="order-filter-pills">
                                        {[
                                            { id: "all", label: `All (${orders.length})` },
                                            { id: "placed", label: "Placed" },
                                            { id: "confirmed", label: "Confirmed" },
                                            { id: "delivered", label: "Delivered" },
                                            { id: "cancelled", label: "Cancelled" },
                                        ].map((pill) => (
                                            <button
                                                key={pill.id}
                                                type="button"
                                                className={`filter-pill ${orderFilter === pill.id ? "active" : ""}`}
                                                onClick={() => setOrderFilter(pill.id)}
                                            >
                                                {pill.label}
                                            </button>
                                        ))}
                                    </div>

                                    {ordersLoading ? (
                                        <div className="account-loading-card">
                                            <div className="account-spinner" />
                                            <p>Loading your orders...</p>
                                        </div>
                                    ) : filteredOrders.length === 0 ? (
                                        <div className="account-card empty-card">
                                            <FaBoxOpen className="empty-card-icon" />
                                            <h3>No orders found</h3>
                                            <p>No orders match the selected filter.</p>
                                            <Link to="/products" className="shop-now-btn">
                                                Browse Products
                                            </Link>
                                        </div>
                                    ) : (
                                        <div className="orders-cards-list">
                                            {filteredOrders.map((ord) => {
                                                const orderIdStr = ord.orderId || ord.order_id;
                                                const orderTotal = ord.total || ord.totalAmount || ord.total_amount;
                                                const itemsList = ord.items || [];

                                                return (
                                                    <div key={ord.id || orderIdStr} className="order-history-card">
                                                        <div className="order-card-header">
                                                            <div className="header-meta">
                                                                <span className="order-code">#{orderIdStr}</span>
                                                                <span className="order-date">{formatDateTime(ord.createdAt || ord.created_at)}</span>
                                                            </div>
                                                            <div className="header-status-side">
                                                                <span className={getStatusBadgeClass(ord.status)}>
                                                                    {ord.status || "Order Placed"}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Items Preview */}
                                                        <div className="order-items-preview-list">
                                                            {itemsList.map((it, idx) => (
                                                                <div key={it.id || idx} className="order-item-thumb-row">
                                                                    <img
                                                                        src={getProductImageUrl(it.image || it.productImage || it.product_image)}
                                                                        alt={it.name || it.productName || it.product_name}
                                                                        className="order-item-thumb"
                                                                        onError={(e) => { e.target.src = "/hero.png"; }}
                                                                    />
                                                                    <div className="order-item-info">
                                                                        <h4>{it.name || it.productName || it.product_name}</h4>
                                                                        <span className="item-meta">
                                                                            {it.size || it.productSize || it.product_size} • Qty: {it.quantity} × ₹{it.unitPrice || it.unit_price || it.price}
                                                                        </span>
                                                                    </div>
                                                                    <strong className="item-subtotal">₹{it.totalPrice || it.total_price || ((it.unitPrice || it.price) * it.quantity)}</strong>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        {/* Footer Row */}
                                                        <div className="order-card-footer">
                                                            <div className="footer-address">
                                                                <FaMapMarkerAlt className="marker-icon" />
                                                                <span>{ord.deliveryAddress || ord.delivery_address}, {ord.city}</span>
                                                            </div>
                                                            <div className="footer-actions-group">
                                                                <div className="total-display">
                                                                    <span className="total-label">Total Amount:</span>
                                                                    <strong className="total-val">₹{orderTotal}</strong>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    className="btn-reorder"
                                                                    onClick={() => handleInitiateReorder(orderIdStr)}
                                                                    disabled={reorderLoading}
                                                                >
                                                                    <FaRedo /> Reorder
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="btn-details"
                                                                    onClick={() => setSelectedOrderDetails(ord)}
                                                                >
                                                                    View Details
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TAB 3: SAVED ADDRESSES */}
                            {activeTab === "addresses" && (
                                <div className="account-section">
                                    <div className="section-header-flex">
                                        <div>
                                            <h2>Saved Delivery Addresses</h2>
                                            <p>Save multiple delivery locations in Harraiya for 1-click checkout.</p>
                                        </div>
                                        <button
                                            type="button"
                                            className="add-address-btn"
                                            onClick={openAddAddressModal}
                                        >
                                            <FaPlus /> Add New Address
                                        </button>
                                    </div>

                                    {addressesLoading ? (
                                        <div className="account-loading-card">
                                            <div className="account-spinner" />
                                            <p>Loading addresses...</p>
                                        </div>
                                    ) : addresses.length === 0 ? (
                                        <div className="account-card empty-card">
                                            <FaMapMarkerAlt className="empty-card-icon" />
                                            <h3>No saved addresses yet</h3>
                                            <p>Add your home or shop address in Harraiya for fast checkout.</p>
                                            <button
                                                type="button"
                                                className="add-address-btn"
                                                onClick={openAddAddressModal}
                                            >
                                                <FaPlus /> Add Your First Address
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="addresses-grid">
                                            {addresses.map((addr) => {
                                                const isDef = Boolean(addr.is_default || addr.isDefault);
                                                return (
                                                    <div key={addr.id} className={`address-card ${isDef ? "default" : ""}`}>
                                                        <div className="address-card-header">
                                                            <div className="address-label-badge">
                                                                {addr.label || "Home"}
                                                            </div>
                                                            {isDef ? (
                                                                <span className="default-pill">
                                                                    <FaCheckCircle /> Default Address
                                                                </span>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    className="make-default-btn"
                                                                    onClick={() => handleSetDefaultAddress(addr.id)}
                                                                >
                                                                    Set as Default
                                                                </button>
                                                            )}
                                                        </div>

                                                        <div className="address-body">
                                                            <h4 className="recipient-name">
                                                                {addr.recipient_name || addr.recipientName}
                                                            </h4>
                                                            <p className="address-text">
                                                                {addr.street_address || addr.streetAddress}
                                                            </p>
                                                            {addr.landmark && (
                                                                <p className="landmark-text">
                                                                    Landmark: <strong>{addr.landmark}</strong>
                                                                </p>
                                                            )}
                                                            <p className="city-pincode-text">
                                                                {addr.city}, {addr.state} - {addr.pincode}
                                                            </p>
                                                            <p className="phone-row">
                                                                <FaPhoneAlt /> +91 {addr.phone}
                                                            </p>
                                                        </div>

                                                        <div className="address-card-actions">
                                                            <button
                                                                type="button"
                                                                className="edit-addr-btn"
                                                                onClick={() => openEditAddressModal(addr)}
                                                            >
                                                                <FaEdit /> Edit
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="delete-addr-btn"
                                                                onClick={() => handleDeleteAddress(addr.id)}
                                                            >
                                                                <FaTrashAlt /> Delete
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TAB 4: MY REVIEWS */}
                            {activeTab === "reviews" && (
                                <div className="account-section">
                                    <div className="section-header">
                                        <h2>My Product Reviews</h2>
                                        <p>Verified reviews you have shared to help your Harraiya neighbours.</p>
                                    </div>

                                    {reviewsLoading ? (
                                        <div className="account-loading-card">
                                            <div className="account-spinner" />
                                            <p>Loading your reviews...</p>
                                        </div>
                                    ) : reviews.length === 0 ? (
                                        <div className="account-card empty-card">
                                            <FaStar className="empty-card-icon" />
                                            <h3>No reviews submitted yet</h3>
                                            <p>Once you receive a delivered order, you can review products directly from the product page.</p>
                                            <button
                                                type="button"
                                                className="shop-now-btn"
                                                onClick={() => handleTabChange("orders")}
                                            >
                                                View Delivered Orders
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="reviews-cards-list">
                                            {reviews.map((rev) => (
                                                <div key={rev.id} className="review-history-card">
                                                    <div className="review-card-top">
                                                        <div className="review-prod-info">
                                                            <img
                                                                src={getProductImageUrl(rev.product_image || rev.productImage)}
                                                                alt={rev.product_name || rev.productName}
                                                                className="review-prod-thumb"
                                                                onError={(e) => { e.target.src = "/hero.png"; }}
                                                            />
                                                            <div>
                                                                <Link to={`/product/${rev.product_id || rev.productId}`} className="review-prod-link">
                                                                    <h4>{rev.product_name || rev.productName}</h4>
                                                                </Link>
                                                                <span className="review-date-meta">
                                                                    Reviewed on {formatDate(rev.created_at)}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="review-rating-stars">
                                                            {[1, 2, 3, 4, 5].map((s) => (
                                                                <FaStar
                                                                    key={s}
                                                                    className={`star-icon ${s <= rev.rating ? "filled" : "empty"}`}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <p className="review-body-text">
                                                        "{rev.review_text || rev.reviewText || "No text commentary provided."}"
                                                    </p>

                                                    <div className="review-card-actions">
                                                        <button
                                                            type="button"
                                                            className="edit-rev-btn"
                                                            onClick={() => openEditReviewModal(rev)}
                                                        >
                                                            <FaEdit /> Edit Review
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="delete-rev-btn"
                                                            onClick={() => handleDeleteReview(rev.id)}
                                                        >
                                                            <FaTrashAlt /> Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {/* --------------------------------------------------------------- */}
            {/* MODAL 1: ADD / EDIT ADDRESS MODAL */}
            {/* --------------------------------------------------------------- */}
            {showAddressModal && (
                <div className="account-modal-overlay" onClick={() => setShowAddressModal(false)}>
                    <div className="account-modal-box" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingAddressId ? "Edit Delivery Address" : "Add New Delivery Address"}</h3>
                            <button
                                type="button"
                                className="modal-close-btn"
                                onClick={() => setShowAddressModal(false)}
                            >
                                <FaTimes />
                            </button>
                        </div>

                        {addressError && (
                            <div className="modal-error-banner">
                                <FaExclamationTriangle />
                                <span>{addressError}</span>
                            </div>
                        )}

                        <form onSubmit={handleSaveAddress} className="address-modal-form">
                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="modal_recipient_name">
                                        Recipient Name <span className="req">*</span>
                                    </label>
                                    <input
                                        id="modal_recipient_name"
                                        type="text"
                                        value={addressForm.recipient_name}
                                        onChange={(e) => setAddressForm({ ...addressForm, recipient_name: e.target.value })}
                                        placeholder="Full Name"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="modal_phone">
                                        10-Digit Phone <span className="req">*</span>
                                    </label>
                                    <input
                                        id="modal_phone"
                                        type="tel"
                                        value={addressForm.phone}
                                        onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value.replace(/\D/g, "") })}
                                        placeholder="Mobile Number"
                                        maxLength="10"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label htmlFor="modal_street">
                                    Street Address / House No. <span className="req">*</span>
                                </label>
                                <textarea
                                    id="modal_street"
                                    value={addressForm.street_address}
                                    onChange={(e) => setAddressForm({ ...addressForm, street_address: e.target.value })}
                                    placeholder="Flat / House no., building, street name"
                                    rows="2"
                                    required
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="modal_landmark">Landmark (Optional)</label>
                                    <input
                                        id="modal_landmark"
                                        type="text"
                                        value={addressForm.landmark}
                                        onChange={(e) => setAddressForm({ ...addressForm, landmark: e.target.value })}
                                        placeholder="Near Bus Stand, SBI ATM, etc."
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="modal_locality">Locality / Village</label>
                                    <input
                                        id="modal_locality"
                                        type="text"
                                        value={addressForm.locality}
                                        onChange={(e) => setAddressForm({ ...addressForm, locality: e.target.value })}
                                        placeholder="Purani Bazar / Belbhariya"
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="modal_city">City</label>
                                    <input
                                        id="modal_city"
                                        type="text"
                                        value={addressForm.city}
                                        onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="modal_pincode">PIN Code</label>
                                    <input
                                        id="modal_pincode"
                                        type="text"
                                        value={addressForm.pincode}
                                        onChange={(e) => setAddressForm({ ...addressForm, pincode: e.target.value })}
                                        maxLength="6"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Address Label</label>
                                <div className="label-radio-group">
                                    {["Home", "Work", "Other"].map((lbl) => (
                                        <label key={lbl} className={`label-radio-pill ${addressForm.label === lbl ? "selected" : ""}`}>
                                            <input
                                                type="radio"
                                                name="address_label"
                                                value={lbl}
                                                checked={addressForm.label === lbl}
                                                onChange={() => setAddressForm({ ...addressForm, label: lbl })}
                                            />
                                            {lbl}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="form-checkbox-row">
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={addressForm.is_default}
                                        onChange={(e) => setAddressForm({ ...addressForm, is_default: e.target.checked })}
                                    />
                                    <span>Set as my default delivery address</span>
                                </label>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-secondary" onClick={() => setShowAddressModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn-primary" disabled={addressSaving}>
                                    {addressSaving ? "Saving..." : editingAddressId ? "Save Changes" : "Add Address"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* --------------------------------------------------------------- */}
            {/* MODAL 2: REORDER PREVIEW MODAL */}
            {/* --------------------------------------------------------------- */}
            {reorderPreviewData && (
                <div className="account-modal-overlay" onClick={() => setReorderPreviewData(null)}>
                    <div className="account-modal-box reorder-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <h3>Reorder Verification</h3>
                                <p className="modal-subtitle">Reviewing items from order #{reorderPreviewData.order_id || reorderPreviewData.orderId}</p>
                            </div>
                            <button
                                type="button"
                                className="modal-close-btn"
                                onClick={() => setReorderPreviewData(null)}
                            >
                                <FaTimes />
                            </button>
                        </div>

                        {reorderPreviewData.any_price_changed && (
                            <div className="reorder-alert-box warning">
                                <FaExclamationTriangle />
                                <span>Some item prices have changed since this order was placed. Current store prices are displayed below.</span>
                            </div>
                        )}

                        {!reorderPreviewData.all_available && (
                            <div className="reorder-alert-box danger">
                                <FaExclamationTriangle />
                                <span>One or more items are currently out of stock or have limited availability. Only available items will be added to your cart.</span>
                            </div>
                        )}

                        <div className="reorder-items-table">
                            {reorderPreviewData.items.map((it, idx) => (
                                <div key={it.product_id || idx} className={`reorder-item-row ${!it.is_available ? "out-of-stock" : ""}`}>
                                    <img
                                        src={getProductImageUrl(it.image)}
                                        alt={it.name}
                                        className="reorder-thumb"
                                        onError={(e) => { e.target.src = "/hero.png"; }}
                                    />
                                    <div className="reorder-item-desc">
                                        <h4>{it.name}</h4>
                                        <span className="reorder-item-qty">Qty requested: {it.requested_quantity}</span>
                                        {!it.is_available ? (
                                            <span className="stock-alert-pill out">Out of Stock</span>
                                        ) : (
                                            <span className="stock-alert-pill in">In Stock</span>
                                        )}
                                    </div>
                                    <div className="reorder-price-col">
                                        <strong className="current-price">₹{it.current_price}</strong>
                                        {it.price_changed && (
                                            <span className="old-price-strike">was ₹{it.original_price}</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="reorder-summary-box">
                            <div className="summary-row">
                                <span>Available Items to Add:</span>
                                <strong>{reorderPreviewData.summary.available_items_count} of {reorderPreviewData.summary.total_items}</strong>
                            </div>
                            <div className="summary-row">
                                <span>Subtotal for available items:</span>
                                <strong className="subtotal-highlight">₹{reorderPreviewData.summary.current_subtotal}</strong>
                            </div>
                        </div>

                        <div className="modal-actions">
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setReorderPreviewData(null)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={handleConfirmReorder}
                                disabled={reorderPreviewData.summary.available_items_count === 0}
                            >
                                Add Available Items to Cart →
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --------------------------------------------------------------- */}
            {/* MODAL 3: ORDER DETAILS MODAL */}
            {/* --------------------------------------------------------------- */}
            {selectedOrderDetails && (
                <div className="account-modal-overlay" onClick={() => setSelectedOrderDetails(null)}>
                    <div className="account-modal-box order-details-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <h3>Order Details</h3>
                                <p className="modal-subtitle">Order ID: #{selectedOrderDetails.orderId || selectedOrderDetails.order_id}</p>
                            </div>
                            <button
                                type="button"
                                className="modal-close-btn"
                                onClick={() => setSelectedOrderDetails(null)}
                            >
                                <FaTimes />
                            </button>
                        </div>

                        <div className="order-details-body">
                            <div className="details-banner-row">
                                <div>
                                    <span className="meta-label">Order Placed</span>
                                    <strong>{formatDateTime(selectedOrderDetails.createdAt || selectedOrderDetails.created_at)}</strong>
                                </div>
                                <span className={getStatusBadgeClass(selectedOrderDetails.status)}>
                                    {selectedOrderDetails.status || "Order Placed"}
                                </span>
                            </div>

                            <div className="details-shipping-box">
                                <h4>Delivery Destination</h4>
                                <p><strong>{selectedOrderDetails.customerName || selectedOrderDetails.customer_name}</strong></p>
                                <p>{selectedOrderDetails.deliveryAddress || selectedOrderDetails.delivery_address}</p>
                                <p>{selectedOrderDetails.city} - {selectedOrderDetails.pincode}</p>
                                <p>Phone: +91 {selectedOrderDetails.customerPhone || selectedOrderDetails.customer_phone}</p>
                                {selectedOrderDetails.deliveryDistanceKm !== undefined && selectedOrderDetails.deliveryDistanceKm !== null && (
                                    <p className="distance-badge-pill">
                                        🛵 Verified Delivery Distance: <strong>{selectedOrderDetails.deliveryDistanceKm} km</strong> from store
                                    </p>
                                )}
                            </div>

                            <h4>Items ({selectedOrderDetails.items ? selectedOrderDetails.items.length : 0})</h4>
                            <div className="details-items-list">
                                {(selectedOrderDetails.items || []).map((it, idx) => (
                                    <div key={it.id || idx} className="details-item-row">
                                        <img
                                            src={getProductImageUrl(it.image || it.productImage || it.product_image)}
                                            alt={it.name || it.productName || it.product_name}
                                            className="details-thumb"
                                            onError={(e) => { e.target.src = "/hero.png"; }}
                                        />
                                        <div className="details-item-text">
                                            <h5>{it.name || it.productName || it.product_name}</h5>
                                            <span>{it.size || it.productSize || it.product_size} • Qty: {it.quantity} × ₹{it.unitPrice || it.unit_price || it.price}</span>
                                        </div>
                                        <strong>₹{it.totalPrice || it.total_price || ((it.unitPrice || it.price) * it.quantity)}</strong>
                                    </div>
                                ))}
                            </div>

                            <div className="details-bill-breakdown">
                                <div className="bill-row">
                                    <span>Subtotal</span>
                                    <span>₹{selectedOrderDetails.subtotal}</span>
                                </div>
                                <div className="bill-row">
                                    <span>Delivery Charge</span>
                                    <span>{Number(selectedOrderDetails.deliveryCharge || selectedOrderDetails.delivery_charge) === 0 ? "FREE" : `₹${selectedOrderDetails.deliveryCharge || selectedOrderDetails.delivery_charge}`}</span>
                                </div>
                                <div className="bill-row grand-total">
                                    <span>Total Amount ({selectedOrderDetails.paymentMethod === "upi" ? "UPI" : "Cash on Delivery"})</span>
                                    <strong>₹{selectedOrderDetails.total || selectedOrderDetails.totalAmount || selectedOrderDetails.total_amount}</strong>
                                </div>
                            </div>
                        </div>

                        <div className="modal-actions">
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setSelectedOrderDetails(null)}
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={() => {
                                    const oid = selectedOrderDetails.orderId || selectedOrderDetails.order_id;
                                    setSelectedOrderDetails(null);
                                    handleInitiateReorder(oid);
                                }}
                            >
                                <FaRedo /> Reorder This Order
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --------------------------------------------------------------- */}
            {/* MODAL 4: EDIT REVIEW MODAL */}
            {/* --------------------------------------------------------------- */}
            {editingReview && (
                <div className="account-modal-overlay" onClick={() => setEditingReview(null)}>
                    <div className="account-modal-box" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Edit Review</h3>
                            <button
                                type="button"
                                className="modal-close-btn"
                                onClick={() => setEditingReview(null)}
                            >
                                <FaTimes />
                            </button>
                        </div>

                        <form onSubmit={handleSaveReview} className="review-modal-form">
                            <p className="review-target-name">
                                Product: <strong>{editingReview.product_name || editingReview.productName}</strong>
                            </p>

                            <div className="form-group">
                                <label>Your Rating</label>
                                <div className="interactive-stars-row">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                        <button
                                            key={star}
                                            type="button"
                                            className={`star-pick-btn ${star <= editRatingVal ? "active" : ""}`}
                                            onClick={() => setEditRatingVal(star)}
                                        >
                                            <FaStar />
                                        </button>
                                    ))}
                                    <span className="rating-num-label">{editRatingVal} of 5 Stars</span>
                                </div>
                            </div>

                            <div className="form-group">
                                <label htmlFor="edit_review_text">Review Commentary</label>
                                <textarea
                                    id="edit_review_text"
                                    value={editTextVal}
                                    onChange={(e) => setEditTextVal(e.target.value)}
                                    placeholder="Share your experience with product quality, packaging, and freshness..."
                                    rows="4"
                                    maxLength="1000"
                                />
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-secondary" onClick={() => setEditingReview(null)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn-primary" disabled={reviewSaving}>
                                    {reviewSaving ? "Saving..." : "Update Review"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <Footer />
        </>
    );
}

