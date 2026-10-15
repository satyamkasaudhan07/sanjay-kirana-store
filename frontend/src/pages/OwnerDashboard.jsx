import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
    FaCrown,
    FaStore,
    FaMoneyBillWave,
    FaShoppingBag,
    FaUsers,
    FaBoxes,
    FaExclamationTriangle,
    FaShieldAlt,
    FaSignOutAlt,
    FaRedo,
    FaCheckCircle,
    FaClock,
    FaMapMarkerAlt,
    FaPhoneAlt,
    FaBell,
    FaWhatsapp,
    FaSearch
} from "react-icons/fa";
import api, { getApiErrorMessage } from "../utils/api";
import { getUser, logout } from "../utils/auth";
import "./OwnerDashboard.css";

const VALID_STATUS_TRANSITIONS = {
    "Order Placed": ["Order Confirmed", "Cancelled"],
    "Order Confirmed": ["Order Packed", "Cancelled"],
    "Order Packed": ["Order Dispatched", "Cancelled"],
    "Order Dispatched": ["Out for Delivery", "Cancelled"],
    "Out for Delivery": ["Delivered", "Cancelled"],
    "Delivered": [],
    "Cancelled": [],
};

const ORDER_STATUS_FILTERS = [
    "ALL",
    "Order Placed",
    "Order Confirmed",
    "Order Packed",
    "Order Dispatched",
    "Out for Delivery",
    "Delivered",
    "Cancelled",
];

function OwnerDashboard() {
    const navigate = useNavigate();
    const ownerUser = getUser();

    // Active tab: 'overview' | 'orders'
    const [activeTab, setActiveTab] = useState("overview");

    // Overview state
    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");

    // Notifications state
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [showNotifDropdown, setShowNotifDropdown] = useState(false);

    // Orders management state
    const [orders, setOrders] = useState([]);
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [orderSearch, setOrderSearch] = useState("");
    const [orderFilter, setOrderFilter] = useState("ALL");
    const [statusDrafts, setStatusDrafts] = useState({}); // { [orderId]: { nextStatus, notes } }
    const [actionLoadingId, setActionLoadingId] = useState(null);
    const [actionMessage, setActionMessage] = useState("");

    // WhatsApp outbox status state
    const [whatsappStatus, setWhatsappStatus] = useState(null);

    // Fetch Overview metrics
    const fetchOverview = async () => {
        setLoading(true);
        setErrorMessage("");
        try {
            const res = await api.get("/owner/overview");
            setOverview(res.data);
        } catch (err) {
            setErrorMessage(getApiErrorMessage(err, "Failed to load owner overview."));
        } finally {
            setLoading(false);
        }
    };

    // Fetch persistent in-site notifications
    const fetchNotifications = useCallback(async () => {
        try {
            const res = await api.get("/owner/notifications");
            setNotifications(res.data?.notifications || []);
            setUnreadCount(res.data?.unread_count || 0);
        } catch (err) {
            console.warn("Could not load notifications:", err);
        }
    }, []);

    // Fetch all store orders for owner management
    const fetchOrders = useCallback(async () => {
        setOrdersLoading(true);
        try {
            const res = await api.get("/admin/orders");
            setOrders(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.warn("Could not load orders for owner:", err);
        } finally {
            setOrdersLoading(false);
        }
    }, []);

    // Fetch WhatsApp gateway status
    const fetchWhatsappStatus = useCallback(async () => {
        try {
            const res = await api.get("/owner/whatsapp/status");
            setWhatsappStatus(res.data);
        } catch (err) {
            console.warn("Could not load WhatsApp status:", err);
        }
    }, []);

    // Mount lifecycle & auto polling (20s)
    useEffect(() => {
        fetchOverview();
        fetchNotifications();
        fetchOrders();
        fetchWhatsappStatus();

        const notifTimer = setInterval(() => {
            fetchNotifications();
        }, 20000);

        return () => clearInterval(notifTimer);
    }, [fetchNotifications, fetchOrders, fetchWhatsappStatus]);

    const handleLogout = () => {
        logout();
        navigate("/owner/login", { replace: true });
    };

    // Notification actions
    const handleMarkNotificationRead = async (notifId, orderNumber) => {
        try {
            await api.patch(`/owner/notifications/${notifId}/read`);
            setNotifications((prev) =>
                prev.map((n) => (n.id === notifId ? { ...n, is_read: true, isRead: true } : n))
            );
            setUnreadCount((prev) => Math.max(0, prev - 1));

            // If an order number was attached, switch to orders tab and search for it
            if (orderNumber) {
                setActiveTab("orders");
                setOrderSearch(orderNumber);
                setShowNotifDropdown(false);
            }
        } catch (err) {
            console.error("Failed to mark notification read:", err);
        }
    };

    const handleMarkAllNotificationsRead = async () => {
        try {
            await api.post("/owner/notifications/mark-all-read");
            setNotifications((prev) =>
                prev.map((n) => ({ ...n, is_read: true, isRead: true }))
            );
            setUnreadCount(0);
        } catch (err) {
            console.error("Failed to mark all read:", err);
        }
    };

    // Handle order status transition update
    const handleStatusChangeSubmit = async (orderId, targetOrderIdStr, currentStatus) => {
        const draft = statusDrafts[orderId] || {};
        const newStatus = draft.nextStatus;
        const notes = draft.notes || "";

        if (!newStatus || newStatus === currentStatus) {
            alert("Please select a new valid status transition.");
            return;
        }

        if (newStatus === "Cancelled") {
            const confirmed = window.confirm(
                `Are you sure you want to cancel Order #${targetOrderIdStr || orderId}?\nThis will automatically restore product stock for all items in PostgreSQL.`
            );
            if (!confirmed) return;
        }

        setActionLoadingId(orderId);
        setActionMessage("");

        try {
            const res = await api.patch(`/orders/${encodeURIComponent(targetOrderIdStr || orderId)}/status`, {
                status: newStatus,
                notes: notes.trim() || `Status updated to ${newStatus} by store owner`,
            });

            // Update local order list
            setOrders((prev) =>
                prev.map((o) =>
                    o.id === orderId || o.order_id === targetOrderIdStr
                        ? { ...o, status: newStatus }
                        : o
                )
            );

            // Clear draft
            setStatusDrafts((prev) => {
                const next = { ...prev };
                delete next[orderId];
                return next;
            });

            setActionMessage(`Order #${targetOrderIdStr || orderId} successfully updated to '${newStatus}'.`);
            setTimeout(() => setActionMessage(""), 4000);
            fetchOverview(); // Refresh overview counts
        } catch (err) {
            alert(getApiErrorMessage(err, "Failed to update order status."));
        } finally {
            setActionLoadingId(null);
        }
    };

    // Filtered orders
    const filteredOrders = useMemo(() => {
        return orders.filter((o) => {
            const statusMatches =
                orderFilter === "ALL" || (o.status || "Order Placed") === orderFilter;

            const q = orderSearch.trim().toLowerCase();
            if (!q) return statusMatches;

            const idMatch = String(o.order_id || o.orderId || o.id).toLowerCase().includes(q);
            const nameMatch = String(o.customer_name || o.customerName || "").toLowerCase().includes(q);
            const phoneMatch = String(o.customer_phone || o.customerPhone || "").includes(q);

            return statusMatches && (idMatch || nameMatch || phoneMatch);
        });
    }, [orders, orderFilter, orderSearch]);

    return (
        <div className="owner-dash-page">
            {/* Top Bar */}
            <header className="owner-dash-header">
                <div className="dash-brand">
                    <FaCrown className="crown-icon" />
                    <div>
                        <h2>Sanjay Kirana Store</h2>
                        <span className="owner-pill">Supreme Owner Governance</span>
                    </div>
                </div>

                <div className="dash-quick-links">
                    {/* Notification Bell */}
                    <div style={{ position: "relative" }}>
                        <button
                            type="button"
                            className="notif-bell-btn"
                            title="Owner Notifications"
                            onClick={() => setShowNotifDropdown(!showNotifDropdown)}
                        >
                            <FaBell />
                            {unreadCount > 0 && (
                                <span className="notif-unread-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
                            )}
                        </button>

                        {/* Dropdown Panel */}
                        {showNotifDropdown && (
                            <div className="notif-dropdown">
                                <div className="notif-dropdown-header">
                                    <h4>
                                        <FaBell style={{ color: "#d97706" }} />
                                        <span>Notifications ({unreadCount} unread)</span>
                                    </h4>
                                    {unreadCount > 0 && (
                                        <button
                                            type="button"
                                            className="mark-all-read-btn"
                                            onClick={handleMarkAllNotificationsRead}
                                        >
                                            Mark all read
                                        </button>
                                    )}
                                </div>

                                <div className="notif-list">
                                    {notifications.length === 0 ? (
                                        <div className="notif-empty">No notifications recorded yet.</div>
                                    ) : (
                                        notifications.map((n) => {
                                            const isUnread = !n.is_read && !n.isRead;
                                            return (
                                                <div
                                                    key={n.id}
                                                    className={`notif-item ${isUnread ? "unread" : ""}`}
                                                    onClick={() => handleMarkNotificationRead(n.id, n.order_number || n.orderNumber)}
                                                >
                                                    <div className="notif-item-content">
                                                        <h5>{n.title}</h5>
                                                        <p>{n.message}</p>
                                                        <span className="notif-time">
                                                            {new Date(n.created_at || n.createdAt).toLocaleString("en-IN", {
                                                                month: "short",
                                                                day: "numeric",
                                                                hour: "2-digit",
                                                                minute: "2-digit",
                                                            })}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <Link to="/admin/dashboard" className="quick-link-btn admin-link">
                        <FaShieldAlt /> Store Operations (Admin Portal)
                    </Link>
                    <Link to="/" className="quick-link-btn store-link">
                        <FaStore /> View Storefront
                    </Link>
                    <button onClick={handleLogout} className="quick-link-btn logout-btn">
                        <FaSignOutAlt /> Sign Out
                    </button>
                </div>
            </header>

            <main className="owner-dash-container" style={{ padding: "24px 32px" }}>
                {/* Hero Greeting */}
                <div className="owner-welcome-card">
                    <div className="owner-avatar">
                        <FaCrown />
                    </div>
                    <div className="welcome-info">
                        <h1>Welcome, {overview?.store?.owner || "Sanjay"} (Store Owner)</h1>
                        <p>
                            Authorized Phone: <strong>+91 {overview?.store?.phone || ownerUser?.phone || "9919193538"}</strong> | 
                            Location: {overview?.store?.location || "Harraiya, Basti, UP"}
                        </p>
                    </div>
                    <button onClick={() => { fetchOverview(); fetchOrders(); fetchNotifications(); }} className="refresh-btn" title="Refresh metrics" disabled={loading}>
                        <FaRedo className={loading ? "spin" : ""} /> Refresh All
                    </button>
                </div>

                {errorMessage && (
                    <div className="owner-dash-alert error" role="alert" style={{ marginBottom: "20px" }}>
                        <FaExclamationTriangle />
                        <span>{errorMessage}</span>
                    </div>
                )}

                {actionMessage && (
                    <div className="owner-dash-alert success" role="alert" style={{ marginBottom: "20px", background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", padding: "12px 18px", borderRadius: "10px" }}>
                        <FaCheckCircle />
                        <span>{actionMessage}</span>
                    </div>
                )}

                {/* Tabs Navigation */}
                <div className="owner-tabs-nav">
                    <button
                        type="button"
                        className={`owner-tab-btn ${activeTab === "overview" ? "active" : ""}`}
                        onClick={() => setActiveTab("overview")}
                    >
                        <span>📊 Store Overview & Analytics</span>
                    </button>

                    <button
                        type="button"
                        className={`owner-tab-btn ${activeTab === "orders" ? "active" : ""}`}
                        onClick={() => setActiveTab("orders")}
                    >
                        <span>📦 Manage Orders</span>
                        <span className="tab-badge">{orders.length}</span>
                    </button>
                </div>

                {/* TAB 1: OVERVIEW & GOVERNANCE */}
                {activeTab === "overview" && (
                    <>
                        {loading && !overview ? (
                            <div className="owner-dash-loading">
                                <div className="spinner"></div>
                                <p>Loading authoritative store governance data...</p>
                            </div>
                        ) : overview ? (
                            <>
                                {/* Financial Metrics Cards */}
                                <div className="owner-metrics-grid">
                                    <div className="metric-card gold">
                                        <div className="metric-header">
                                            <span className="metric-title">Total Gross Revenue</span>
                                            <FaMoneyBillWave className="metric-icon" />
                                        </div>
                                        <div className="metric-value">
                                            ₹{overview.financials?.total_revenue?.toLocaleString("en-IN", { minimumFractionDigits: 2 }) || "0.00"}
                                        </div>
                                        <span className="metric-sub">Across all confirmed & delivered orders</span>
                                    </div>

                                    <div className="metric-card green">
                                        <div className="metric-header">
                                            <span className="metric-title">Total Orders</span>
                                            <FaShoppingBag className="metric-icon" />
                                        </div>
                                        <div className="metric-value">{overview.financials?.total_orders || 0}</div>
                                        <span className="metric-sub">Total lifetime orders placed</span>
                                    </div>

                                    <div className="metric-card blue">
                                        <div className="metric-header">
                                            <span className="metric-title">Catalogued Products</span>
                                            <FaBoxes className="metric-icon" />
                                        </div>
                                        <div className="metric-value">{overview.inventory?.total_products || 0}</div>
                                        <span className="metric-sub">
                                            {overview.inventory?.low_stock_alerts > 0 ? (
                                                <span className="warn-text">⚠️ {overview.inventory.low_stock_alerts} items low stock</span>
                                            ) : (
                                                "All inventory levels healthy"
                                            )}
                                        </span>
                                    </div>

                                    <div className="metric-card purple">
                                        <div className="metric-header">
                                            <span className="metric-title">Registered Customers</span>
                                            <FaUsers className="metric-icon" />
                                        </div>
                                        <div className="metric-value">{overview.customers?.total_registered || 0}</div>
                                        <span className="metric-sub">Verified customer accounts</span>
                                    </div>
                                </div>

                                {/* Order Status Breakdown & Staff Management */}
                                <div className="owner-two-col-grid">
                                    {/* Order Status Breakdown */}
                                    <div className="owner-panel-card">
                                        <h3>Order Status Breakdown</h3>
                                        <div className="status-bars-list">
                                            {Object.entries(overview.financials?.status_breakdown || {}).map(([status, count]) => (
                                                <div key={status} className="status-row">
                                                    <span className="status-name">{status}</span>
                                                    <div className="status-bar-bg">
                                                        <div
                                                            className="status-bar-fill"
                                                            style={{
                                                                width: `${Math.min(
                                                                    100,
                                                                    (count / Math.max(1, overview.financials?.total_orders || 1)) * 100
                                                                )}%`,
                                                            }}
                                                        ></div>
                                                    </div>
                                                    <strong className="status-count">{count}</strong>
                                                </div>
                                            ))}
                                            {Object.keys(overview.financials?.status_breakdown || {}).length === 0 && (
                                                <p className="empty-panel-text">No order activity recorded yet.</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Store Staff Accounts */}
                                    <div className="owner-panel-card">
                                        <h3>Store Staff (Admin Accounts)</h3>
                                        <div className="admin-staff-list">
                                            {overview.admin_staff?.map((staff) => (
                                                <div key={staff.id} className="staff-item">
                                                    <div className="staff-info">
                                                        <FaShieldAlt className="staff-icon" />
                                                        <div>
                                                            <strong className="staff-username">{staff.username}</strong>
                                                            <span className="staff-phone">+91 {staff.phone}</span>
                                                        </div>
                                                    </div>
                                                    <div className="staff-meta">
                                                        <span className={`staff-status ${staff.is_active ? "active" : "inactive"}`}>
                                                            {staff.is_active ? "Active Staff" : "Inactive"}
                                                        </span>
                                                        {staff.last_login_at && (
                                                            <span className="last-login">
                                                                Last active: {new Date(staff.last_login_at).toLocaleDateString("en-IN")}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* WhatsApp Gateway Status Card */}
                                <div className="whatsapp-status-card">
                                    <div className="whatsapp-status-info">
                                        <h4>
                                            <FaWhatsapp style={{ color: "#25D366", fontSize: "1.2rem" }} />
                                            <span>WhatsApp Owner Order Alerts Gateway</span>
                                        </h4>
                                        <p>
                                            Destination Phone: <strong>+91 {whatsappStatus?.recipient_phone || "9919193538"}</strong> | 
                                            Status: <strong>{whatsappStatus?.configured ? "🟢 Live Active" : "🟡 Outbox Tracking Ready (API Token Pending)"}</strong>
                                        </p>
                                    </div>

                                    <div className="whatsapp-counts-pills">
                                        <div className="wa-count-pill">
                                            Outbox Records: {Object.values(whatsappStatus?.outbox_counts || {}).reduce((a, b) => a + b, 0)}
                                        </div>
                                        <div className="wa-count-pill" style={{ borderColor: "#60a5fa", color: "#1e40af" }}>
                                            Logged: {whatsappStatus?.outbox_counts?.unconfigured || 0}
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : null}
                    </>
                )}

                {/* TAB 2: ORDER MANAGEMENT */}
                {activeTab === "orders" && (
                    <div className="owner-orders-section">
                        {/* Toolbar: Search & Status Filters */}
                        <div className="owner-orders-toolbar">
                            <input
                                type="text"
                                className="order-search-input"
                                placeholder="Search by Order ID, Customer, or Phone..."
                                value={orderSearch}
                                onChange={(e) => setOrderSearch(e.target.value)}
                            />

                            <div className="order-filter-pills">
                                {ORDER_STATUS_FILTERS.map((st) => (
                                    <button
                                        key={st}
                                        type="button"
                                        className={`filter-pill ${orderFilter === st ? "active" : ""}`}
                                        onClick={() => setOrderFilter(st)}
                                    >
                                        {st}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Orders Table */}
                        <div className="owner-orders-table-card">
                            {ordersLoading ? (
                                <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                                    <div className="spinner" style={{ margin: "0 auto 10px" }}></div>
                                    Loading customer orders...
                                </div>
                            ) : filteredOrders.length === 0 ? (
                                <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                                    No orders match the selected filter.
                                </div>
                            ) : (
                                <table className="owner-orders-table">
                                    <thead>
                                        <tr>
                                            <th>Order ID & Date</th>
                                            <th>Customer Details</th>
                                            <th>Total & Items</th>
                                            <th>Current Status</th>
                                            <th>Status Transition</th>
                                            <th>Tracking Link</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredOrders.map((o) => {
                                            const oid = o.id;
                                            const orderNumber = o.order_id || o.orderId || `#${oid}`;
                                            const currentStatus = o.status || "Order Placed";
                                            const allowedNext = VALID_STATUS_TRANSITIONS[currentStatus] || [];
                                            const isTerminal = allowedNext.length === 0;

                                            const draft = statusDrafts[oid] || {
                                                nextStatus: allowedNext[0] || "",
                                                notes: "",
                                            };

                                            return (
                                                <tr key={orderNumber}>
                                                    <td>
                                                        <strong style={{ color: "#111827", display: "block" }}>{orderNumber}</strong>
                                                        <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                                                            {new Date(o.created_at || o.createdAt).toLocaleString("en-IN", {
                                                                month: "short",
                                                                day: "numeric",
                                                                hour: "2-digit",
                                                                minute: "2-digit",
                                                            })}
                                                        </span>
                                                    </td>

                                                    <td>
                                                        <div className="order-customer-info">
                                                            <h5>{o.customer_name || o.customerName}</h5>
                                                            <p>📞 {o.customer_phone || o.customerPhone}</p>
                                                            <p style={{ fontSize: "0.76rem", color: "#94a3b8" }}>
                                                                📍 {o.delivery_address || o.deliveryAddress}
                                                                {o.deliveryDistanceKm ? ` (${o.deliveryDistanceKm} km)` : ""}
                                                            </p>
                                                        </div>
                                                    </td>

                                                    <td>
                                                        <strong style={{ color: "#166534", fontSize: "0.98rem", display: "block" }}>
                                                            ₹{(o.total_amount || o.total || 0).toFixed(2)}
                                                        </strong>
                                                        <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                                                            {o.total_items || o.totalItems || o.items?.length || 1} items • {String(o.payment_method || o.paymentMethod).toUpperCase()}
                                                        </span>
                                                    </td>

                                                    <td>
                                                        <span className={`track-status-badge ${currentStatus.toLowerCase().replace(/\s+/g, "_")}`}>
                                                            {currentStatus}
                                                        </span>
                                                    </td>

                                                    <td>
                                                        {isTerminal ? (
                                                            <span style={{ fontSize: "0.82rem", color: "#94a3b8", fontStyle: "italic" }}>
                                                                Terminal ({currentStatus})
                                                            </span>
                                                        ) : (
                                                            <div className="status-change-box">
                                                                <select
                                                                    className="status-select-input"
                                                                    value={draft.nextStatus}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        setStatusDrafts((prev) => ({
                                                                            ...prev,
                                                                            [oid]: { ...draft, nextStatus: val },
                                                                        }));
                                                                    }}
                                                                >
                                                                    {allowedNext.map((st) => (
                                                                        <option key={st} value={st}>
                                                                            → {st}
                                                                        </option>
                                                                    ))}
                                                                </select>

                                                                <input
                                                                    type="text"
                                                                    className="status-notes-input"
                                                                    placeholder="Internal note (optional)"
                                                                    value={draft.notes}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        setStatusDrafts((prev) => ({
                                                                            ...prev,
                                                                            [oid]: { ...draft, notes: val },
                                                                        }));
                                                                    }}
                                                                />

                                                                <button
                                                                    type="button"
                                                                    className="status-update-submit-btn"
                                                                    onClick={() => handleStatusChangeSubmit(oid, orderNumber, currentStatus)}
                                                                    disabled={actionLoadingId === oid}
                                                                >
                                                                    {actionLoadingId === oid ? "Updating..." : "Update Status ✓"}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>

                                                    <td>
                                                        <Link
                                                            to={`/track-order/${orderNumber}`}
                                                            target="_blank"
                                                            className="quick-link-btn"
                                                            style={{
                                                                background: "#f0fdf4",
                                                                color: "#166534",
                                                                border: "1px solid #bbf7d0",
                                                                padding: "6px 12px",
                                                                fontSize: "0.82rem",
                                                                textDecoration: "none"
                                                            }}
                                                            title="Open live customer tracking page"
                                                        >
                                                            <span>📍</span>
                                                            <span>Track</span>
                                                        </Link>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

export default OwnerDashboard;
