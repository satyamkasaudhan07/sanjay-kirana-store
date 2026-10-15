import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar/Navbar";
import Footer from "../components/Footer/Footer";
import { getProductImageUrl } from "../utils/image";
import api, { getApiErrorMessage } from "../utils/api";
import { isAuthenticated, getUser } from "../utils/auth";
import "./Orders.css";

function Orders({ cart = [], wishlist = [] }) {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const authed = isAuthenticated();
    const currentUser = getUser();

    const fetchOrders = useCallback(() => {
        if (!authed) {
            setOrders([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        setErrorMessage("");
        api.get("/orders")
            .then((res) => {
                if (Array.isArray(res.data)) {
                    setOrders(res.data);
                } else {
                    setOrders([]);
                }
            })
            .catch((err) => {
                const msg = getApiErrorMessage(err, "Failed to load your orders. Please check your connection and try again.");
                setErrorMessage(msg);
                setOrders([]);
            })
            .finally(() => {
                setLoading(false);
            });
    }, [authed]);

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    const formatDate = (dateString) => {
        if (!dateString) return "Recently Placed";
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return String(dateString);
            return date.toLocaleDateString("en-IN", {
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

    const formatPaymentMethod = (method) => {
        if (!method) return "Cash on Delivery (COD)";
        const lower = String(method).toLowerCase();
        if (lower === "cod") return "Cash on Delivery (COD)";
        if (lower === "upi") return "UPI / QR Code";
        return method;
    };

    return (
        <>
            <Navbar cart={cart} wishlist={wishlist} />

            <main className="orders-page">
                <div className="orders-page-header">
                    <h1>My Orders 📦</h1>
                    {authed && currentUser && (
                        <span className="customer-orders-pill">
                            Account: <strong>{currentUser.phone || currentUser.name}</strong>
                        </span>
                    )}
                </div>

                {loading ? (
                    <div className="no-orders">
                        <div className="spinner"></div>
                        <p>Loading your orders...</p>
                    </div>
                ) : errorMessage ? (
                    <div className="no-orders orders-error">
                        <div className="no-orders-icon">⚠️</div>
                        <h2>Unable to Load Orders</h2>
                        <p>{errorMessage}</p>
                        <div className="no-orders-actions">
                            <button type="button" onClick={fetchOrders} className="shop-orders-btn">
                                Retry
                            </button>
                        </div>
                    </div>
                ) : !authed ? (
                    <div className="no-orders">
                        <div className="no-orders-icon">📦</div>
                        <h2>Track Your Orders</h2>
                        <p>
                            You are currently browsing as a guest. Sign in with your mobile number to view your complete order history, live delivery status, and reorder past essentials.
                        </p>
                        <div className="no-orders-actions">
                            <Link to="/login" state={{ from: "/orders" }} className="signin-orders-btn">
                                Sign In with Mobile OTP →
                            </Link>
                            <Link to="/products" className="shop-orders-btn">
                                Start Shopping
                            </Link>
                        </div>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="no-orders">
                        <div className="no-orders-icon">📦</div>
                        <h2>No orders found</h2>
                        <p>
                            You haven't placed any orders with this account yet. When you place an order, it will appear here with live tracking.
                        </p>
                        <div className="no-orders-actions">
                            <Link to="/products" className="shop-orders-btn">
                                Start Shopping
                            </Link>
                        </div>
                    </div>
                ) : (
                    <div className="orders-list">
                        {orders.map((order, index) => {
                            const orderNumber = order.orderId || order.order_id || `#${order.id || index + 1}`;
                            const rawDate = order.createdAt || order.created_at || order.date;
                            const items = Array.isArray(order.items) ? order.items : [];
                            const totalAmount = order.total ?? order.totalAmount ?? order.total_amount ?? 0;
                            const totalItemsCount = order.totalItems ?? order.total_items ?? items.reduce((sum, it) => sum + (it.quantity || 1), 0);
                            const deliveryFee = order.deliveryCharge ?? order.delivery_charge;

                            return (
                                <div className="order-card" key={orderNumber}>
                                    <div className="order-header">
                                        <div>
                                            <span>Order ID</span>
                                            <strong>{orderNumber}</strong>
                                        </div>

                                        <div>
                                            <span>Placed On</span>
                                            <strong>{formatDate(rawDate)}</strong>
                                        </div>

                                        <div>
                                            <span>Payment Method</span>
                                            <strong>{formatPaymentMethod(order.paymentMethod || order.payment_method)}</strong>
                                        </div>

                                        <span className="order-status">
                                            {order.status || "Order Placed"}
                                        </span>
                                    </div>

                                    <div className="order-products">
                                        {items.map((item, itemIdx) => {
                                            const itemName = item.name || item.productName || item.product_name || "Product";
                                            const itemSize = item.size || item.product_size || "";
                                            const itemQty = item.quantity || 1;
                                            const unitPrice = item.price ?? item.unitPrice ?? item.unit_price ?? 0;
                                            const lineTotal = item.totalPrice ?? item.total_price ?? (unitPrice * itemQty);

                                            return (
                                                <div
                                                    className="order-product"
                                                    key={item.id || `${orderNumber}-item-${itemIdx}`}
                                                >
                                                    <img
                                                        src={getProductImageUrl(item.image || item.product_image)}
                                                        alt={itemName}
                                                        onError={(e) => {
                                                            e.target.src = "/hero.png";
                                                        }}
                                                    />

                                                    <div>
                                                        <h3>{itemName}</h3>
                                                        <p>
                                                            {itemSize ? `${itemSize} · ` : ""}
                                                            ₹{unitPrice} × {itemQty}
                                                        </p>
                                                    </div>

                                                    <strong>₹{lineTotal}</strong>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="order-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                                        <span>
                                            {totalItemsCount} {totalItemsCount === 1 ? "item" : "items"}
                                            {deliveryFee !== undefined ? ` · Delivery: ${deliveryFee === 0 ? "FREE" : `₹${deliveryFee}`}` : ""}
                                        </span>

                                        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                                            <strong>
                                                Total Paid: ₹{totalAmount}
                                            </strong>
                                            <Link
                                                to={`/track-order/${orderNumber}`}
                                                className="track-order-link"
                                                style={{
                                                    background: "var(--color-primary, #176534)",
                                                    color: "#ffffff",
                                                    padding: "6px 14px",
                                                    borderRadius: "8px",
                                                    fontSize: "0.85rem",
                                                    fontWeight: "600",
                                                    textDecoration: "none",
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    gap: "6px"
                                                }}
                                            >
                                                <span>📍</span> Track Order
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
            <Footer />
        </>
    );
}

export default Orders;