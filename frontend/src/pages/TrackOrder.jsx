import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar/Navbar";
import Footer from "../components/Footer/Footer";
import api, { getApiErrorMessage } from "../utils/api";
import { getProductImageUrl } from "../utils/image";
import "./TrackOrder.css";

const STAGE_ICONS = {
    "Order Placed": "📝",
    "Order Confirmed": "📋",
    "Order Packed": "📦",
    "Order Dispatched": "🚚",
    "Out for Delivery": "🛵",
    "Delivered": "🏡",
    "Cancelled": "❌",
};

function TrackOrder({ cart = [], wishlist = [] }) {
    const { orderId } = useParams();
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token") || "";
    const navigate = useNavigate();

    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");
    const [cancelling, setCancelling] = useState(false);
    const [cancelSuccess, setCancelSuccess] = useState("");
    const [lastPolledAt, setLastPolledAt] = useState(new Date());

    const fetchTracking = useCallback(async (isPolling = false) => {
        if (!isPolling) setLoading(true);
        setErrorMessage("");

        try {
            const url = `/orders/${encodeURIComponent(orderId)}/tracking${
                token ? `?token=${encodeURIComponent(token)}` : ""
            }`;
            const res = await api.get(url);
            if (res.data && res.data.order) {
                setOrder(res.data.order);
                setLastPolledAt(new Date());
            } else {
                setErrorMessage("Tracking information unavailable for this order.");
            }
        } catch (err) {
            const msg = getApiErrorMessage(
                err,
                "Unable to retrieve tracking details. Please check the order number or link."
            );
            setErrorMessage(msg);
        } finally {
            if (!isPolling) setLoading(false);
        }
    }, [orderId, token]);

    // Initial fetch on mount or parameter changes
    useEffect(() => {
        fetchTracking(false);
    }, [fetchTracking]);

    // Live polling every 15 seconds if order is active (not terminal state)
    useEffect(() => {
        if (!order) return;
        const terminalStates = ["Delivered", "Cancelled"];
        if (terminalStates.includes(order.status)) return;

        const interval = setInterval(() => {
            fetchTracking(true);
        }, 15000);

        return () => clearInterval(interval);
    }, [order, fetchTracking]);

    // Customer cancellation
    const handleCancelOrder = async () => {
        if (!window.confirm("Are you sure you want to cancel this order? This will restore product inventory and cancel delivery.")) {
            return;
        }

        setCancelling(true);
        setErrorMessage("");
        setCancelSuccess("");

        try {
            const res = await api.post(`/orders/${encodeURIComponent(orderId)}/cancel`, {
                notes: "Cancelled by customer via order tracking page",
            });
            setCancelSuccess(res.data?.message || "Order has been cancelled successfully.");
            fetchTracking(false);
        } catch (err) {
            const msg = getApiErrorMessage(err, "Failed to cancel order. Please contact store owner at 9919193538.");
            setErrorMessage(msg);
        } finally {
            setCancelling(false);
        }
    };

    const getStatusClass = (status) => {
        if (!status) return "placed";
        return status.toLowerCase().replace(/\s+/g, "_");
    };

    const formatTimestamp = (dateString) => {
        if (!dateString) return null;
        try {
            const dt = new Date(dateString);
            if (isNaN(dt.getTime())) return String(dateString);
            return dt.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            });
        } catch {
            return String(dateString);
        }
    };

    return (
        <>
            <Navbar cart={cart} wishlist={wishlist} />

            <main className="track-order-page">
                <div className="track-order-container">
                    {/* Header */}
                    <div className="track-order-header">
                        <div className="track-order-title">
                            <h1>
                                <span>📍</span>
                                <span>Track Order #{order?.orderId || order?.order_id || orderId}</span>
                            </h1>
                            <p className="track-order-meta">
                                Placed on: <strong>{formatTimestamp(order?.createdAt || order?.created_at) || "Recently"}</strong>
                            </p>
                        </div>

                        {order && (
                            <div className={`track-status-badge ${getStatusClass(order.status)}`}>
                                <span>{STAGE_ICONS[order.status] || "📦"}</span>
                                <span>{order.status}</span>
                            </div>
                        )}
                    </div>

                    {/* Public visitor notice */}
                    {order?.isPublicView && (
                        <div className="public-tracking-banner">
                            <span>🔒</span>
                            <span>Public tracking view: sensitive phone & address details are masked to protect customer privacy.</span>
                        </div>
                    )}

                    {/* Alerts */}
                    {errorMessage && (
                        <div className="cancelled-banner" role="alert" style={{ background: "#fef2f2", borderColor: "#fecaca" }}>
                            <div className="cancelled-icon">⚠️</div>
                            <div>
                                <h3>Unable to Load Tracking</h3>
                                <p>{errorMessage}</p>
                            </div>
                        </div>
                    )}

                    {cancelSuccess && (
                        <div className="cancelled-banner" role="alert" style={{ background: "#f0fdf4", borderColor: "#bbf7d0" }}>
                            <div className="cancelled-icon">✓</div>
                            <div>
                                <h3 style={{ color: "#166534" }}>Order Cancelled</h3>
                                <p style={{ color: "#15803d" }}>{cancelSuccess}</p>
                            </div>
                        </div>
                    )}

                    {loading ? (
                        <div className="track-card" style={{ textAlign: "center", padding: "60px 20px" }}>
                            <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
                            <p style={{ color: "#6b7280" }}>Retrieving live order tracking from Sanjay Kirana Store...</p>
                        </div>
                    ) : order ? (
                        <>
                            {/* Cancelled Banner if status is Cancelled */}
                            {order.isCancelled && (
                                <div className="cancelled-banner">
                                    <div className="cancelled-icon">❌</div>
                                    <div>
                                        <h3>Order Cancelled</h3>
                                        <p>
                                            This order was cancelled. Any reserved stock has been returned to store inventory.
                                            For questions, please call Sanjay Kirana Store at <strong>+91 9919193538</strong>.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Timeline Card */}
                            <div className="track-card">
                                <div className="track-card-header">
                                    <h2>
                                        <span>🚚</span>
                                        <span>Delivery Progress</span>
                                    </h2>
                                    <span className="last-updated-text">
                                        Last checked: {lastPolledAt.toLocaleTimeString("en-IN")}
                                    </span>
                                </div>

                                <ul className="tracking-timeline">
                                    {order.timeline?.map((stage, idx) => (
                                        <li
                                            key={stage.status || idx}
                                            className={`timeline-step ${stage.completed ? "completed" : ""} ${
                                                stage.current ? "current" : ""
                                            }`}
                                        >
                                            <div className="timeline-marker">
                                                {stage.completed ? "✓" : STAGE_ICONS[stage.status] || idx + 1}
                                            </div>

                                            <div className="timeline-content">
                                                <h3>
                                                    <span>{stage.title}</span>
                                                    {stage.current && (
                                                        <span style={{ fontSize: "0.75rem", background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: "10px", fontWeight: "600" }}>
                                                            Current Stage
                                                        </span>
                                                    )}
                                                </h3>
                                                <p>{stage.message || stage.description}</p>
                                                {stage.timestamp && (
                                                    <span className="timeline-timestamp">
                                                        {formatTimestamp(stage.timestamp)}
                                                    </span>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* Details Grid: Delivery & Payment */}
                            <div className="track-grid">
                                {/* Delivery Address Card */}
                                <div className="track-card">
                                    <div className="track-card-header">
                                        <h2>
                                            <span>🛵</span>
                                            <span>Delivery Address</span>
                                        </h2>
                                    </div>

                                    <div className="track-detail-list">
                                        <div className="track-detail-row">
                                            <span>Recipient Name</span>
                                            <strong>{order.customerName || order.customer_name}</strong>
                                        </div>
                                        <div className="track-detail-row">
                                            <span>Contact Phone</span>
                                            <strong>{order.customerPhone || order.customer_phone}</strong>
                                        </div>
                                        <div className="track-detail-row">
                                            <span>Address</span>
                                            <strong>
                                                {order.deliveryAddress || order.delivery_address}, {order.city} - {order.pincode}
                                            </strong>
                                        </div>
                                        {order.deliveryDistanceKm !== undefined && order.deliveryDistanceKm !== null && (
                                            <div className="track-detail-row">
                                                <span>Distance from Store</span>
                                                <strong style={{ color: "#166534" }}>
                                                    {order.deliveryDistanceKm} km (Verified Harraiya Zone)
                                                </strong>
                                            </div>
                                        )}
                                        <div className="track-detail-row">
                                            <span>Store Support</span>
                                            <strong>+91 9919193538 (Sanjay)</strong>
                                        </div>
                                    </div>
                                </div>

                                {/* Payment Details Card */}
                                <div className="track-card">
                                    <div className="track-card-header">
                                        <h2>
                                            <span>💳</span>
                                            <span>Payment Summary</span>
                                        </h2>
                                    </div>

                                    <div className="track-detail-list">
                                        <div className="track-detail-row">
                                            <span>Payment Method</span>
                                            <strong>
                                                {String(order.paymentMethod || order.payment_method).toLowerCase() === "upi"
                                                    ? "UPI / QR Code on Delivery"
                                                    : "Cash on Delivery (COD)"}
                                            </strong>
                                        </div>
                                        <div className="track-detail-row">
                                            <span>Items Subtotal</span>
                                            <strong>₹{(order.subtotal || 0).toFixed(2)}</strong>
                                        </div>
                                        <div className="track-detail-row">
                                            <span>Delivery Charge</span>
                                            <strong style={{ color: (order.deliveryCharge === 0 || order.delivery_charge === 0) ? "#166534" : "#111827" }}>
                                                {(order.deliveryCharge === 0 || order.delivery_charge === 0)
                                                    ? "FREE"
                                                    : `₹${(order.deliveryCharge || order.delivery_charge || 0).toFixed(2)}`}
                                            </strong>
                                        </div>
                                        <div className="track-total-box">
                                            <span>Total Amount</span>
                                            <strong>₹{(order.total || order.totalAmount || order.total_amount || 0).toFixed(2)}</strong>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Ordered Items Card */}
                            <div className="track-card">
                                <div className="track-card-header">
                                    <h2>
                                        <span>🛍️</span>
                                        <span>Items in This Order ({order.items?.length || 0})</span>
                                    </h2>
                                </div>

                                <div className="track-items-list">
                                    {order.items?.map((item, idx) => (
                                        <div className="track-item-row" key={item.id || idx}>
                                            <div className="track-item-info">
                                                <img
                                                    src={getProductImageUrl(item.image || item.product_image)}
                                                    alt={item.name || item.productName}
                                                    className="track-item-img"
                                                    onError={(e) => {
                                                        e.target.src = "/hero.png";
                                                    }}
                                                />
                                                <div className="track-item-details">
                                                    <h4>{item.name || item.productName || item.product_name}</h4>
                                                    <p>
                                                        {item.size || item.product_size ? `${item.size || item.product_size} • ` : ""}
                                                        Qty: {item.quantity} × ₹{item.unitPrice || item.unit_price || item.price}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="track-item-price">
                                                ₹{(item.totalPrice || item.total_price || (item.unitPrice * item.quantity)).toFixed(2)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Actions Footer */}
                            <div className="track-actions-bar">
                                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                                    <button
                                        type="button"
                                        className="track-btn secondary"
                                        onClick={() => fetchTracking(false)}
                                    >
                                        🔄 Refresh Status
                                    </button>

                                    <Link to="/orders" className="track-btn secondary">
                                        📦 My Orders
                                    </Link>

                                    <Link to="/" className="track-btn secondary">
                                        🏪 Return to Store
                                    </Link>
                                </div>

                                {order.canCancel && (
                                    <button
                                        type="button"
                                        className="track-btn danger"
                                        onClick={handleCancelOrder}
                                        disabled={cancelling}
                                    >
                                        {cancelling ? "Cancelling Order..." : "❌ Cancel Order"}
                                    </button>
                                )}
                            </div>
                        </>
                    ) : null}
                </div>
            </main>

            <Footer />
        </>
    );
}

export default TrackOrder;

