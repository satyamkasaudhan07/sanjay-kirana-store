import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { getApiErrorMessage } from "../utils/api";
import { getUser, logout } from "../utils/auth";
import { getProductImageUrl } from "../utils/image";
import "./AdminDashboard.css";

const ORDER_STATUSES = [
    "Order Placed",
    "Order Confirmed",
    "Order Packed",
    "Order Dispatched",
    "Out for Delivery",
    "Delivered",
    "Cancelled"
];

function AdminDashboard() {
    const navigate = useNavigate();
    const adminUser = getUser();

    // Active tab: 'orders' | 'products' | 'stock' | 'customers'
    const [activeTab, setActiveTab] = useState("orders");

    // Data states
    const [orders, setOrders] = useState([]);
    const [products, setProducts] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [categories, setCategories] = useState([]);

    // UI & Loading states
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [toastMessage, setToastMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");

    // Orders tab filter
    const [orderStatusFilter, setOrderStatusFilter] = useState("ALL");
    const [expandedOrderId, setExpandedOrderId] = useState(null);

    // Products tab filters & modal
    const [productSearch, setProductSearch] = useState("");
    const [productCategoryFilter, setProductCategoryFilter] = useState("ALL");
    const [showProductModal, setShowProductModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);

    // Product form state
    const [productForm, setProductForm] = useState({
        name: "",
        category: "",
        subCategory: "",
        brand: "",
        size: "",
        price: "",
        originalPrice: "",
        stock: "",
        discount: "",
        image: "",
        description: "",
    });

    // Stock quick adjustment tab states
    const [stockFilterLowOnly, setStockFilterLowOnly] = useState(false);
    const [stockEditState, setStockEditState] = useState({});

    const showToast = (msg) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(""), 3500);
    };

    // Load initial data
    const fetchAllData = async () => {
        setLoading(true);
        setErrorMessage("");
        try {
            const [ordersRes, productsRes, customersRes, categoriesRes] = await Promise.all([
                api.get("/admin/orders").catch(() => ({ data: [] })),
                api.get("/products").catch(() => ({ data: [] })),
                api.get("/admin/customers").catch(() => ({ data: [] })),
                api.get("/categories").catch(() => ({ data: [] })),
            ]);

            setOrders(Array.isArray(ordersRes.data) ? ordersRes.data : []);
            setProducts(Array.isArray(productsRes.data) ? productsRes.data : []);
            setCustomers(Array.isArray(customersRes.data) ? customersRes.data : []);
            setCategories(Array.isArray(categoriesRes.data) ? categoriesRes.data : []);
        } catch (err) {
            setErrorMessage(getApiErrorMessage(err, "Failed to load admin data."));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllData();
    }, []);

    const handleLogout = () => {
        logout();
        navigate("/admin/login", { replace: true });
    };

    // --- ORDERS MANAGEMENT ---
    const handleUpdateOrderStatus = async (orderId, newStatus) => {
        setActionLoading(true);
        try {
            await api.patch(`/admin/orders/${orderId}/status`, { status: newStatus });
            setOrders((prev) =>
                prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
            );
            showToast(`Order status updated to '${newStatus}'`);
        } catch (err) {
            showToast(`Error: ${getApiErrorMessage(err, "Failed to update status")}`);
        } finally {
            setActionLoading(false);
        }
    };

    const filteredOrders = useMemo(() => {
        if (orderStatusFilter === "ALL") return orders;
        return orders.filter((o) => (o.status || "Order Placed") === orderStatusFilter);
    }, [orders, orderStatusFilter]);

    // Statistics calculations
    const stats = useMemo(() => {
        const totalRevenue = orders
            .filter((o) => o.status !== "Cancelled")
            .reduce((sum, o) => sum + (Number(o.total_amount) || Number(o.total) || 0), 0);
        const pendingCount = orders.filter((o) => o.status === "Order Placed" || o.status === "Confirmed").length;
        const lowStockCount = products.filter((p) => (Number(p.stock) || 0) < 10).length;

        return {
            totalOrders: orders.length,
            totalRevenue: Math.round(totalRevenue),
            pendingCount,
            lowStockCount,
            totalCustomers: customers.length,
        };
    }, [orders, products, customers]);

    // --- PRODUCTS MANAGEMENT ---
    const handleOpenAddModal = () => {
        setEditingProduct(null);
        setProductForm({
            name: "",
            category: categories[0]?.name || "Grains & Pulses",
            subCategory: "",
            brand: "",
            size: "",
            price: "",
            originalPrice: "",
            stock: "10",
            discount: "",
            image: "",
            description: "",
        });
        setShowProductModal(true);
    };

    const handleOpenEditModal = (prod) => {
        setEditingProduct(prod);
        setProductForm({
            name: prod.name || "",
            category: prod.category || "",
            subCategory: prod.subCategory || prod.sub_category || "",
            brand: prod.brand || "",
            size: prod.size || "",
            price: prod.price || "",
            originalPrice: prod.originalPrice || prod.original_price || "",
            stock: prod.stock || "0",
            discount: prod.discount || "",
            image: prod.image || "",
            description: prod.description || "",
        });
        setShowProductModal(true);
    };

    const handleSaveProduct = async (e) => {
        e.preventDefault();
        if (!productForm.name.trim() || !productForm.category || !productForm.price) {
            alert("Name, Category, and Price are required.");
            return;
        }

        setActionLoading(true);
        try {
            const payload = {
                name: productForm.name.trim(),
                category: productForm.category.trim(),
                subCategory: productForm.subCategory.trim(),
                brand: productForm.brand.trim(),
                size: productForm.size.trim(),
                price: parseFloat(productForm.price),
                originalPrice: parseFloat(productForm.originalPrice || productForm.price),
                stock: parseInt(productForm.stock, 10) || 0,
                discount: productForm.discount ? parseInt(productForm.discount, 10) || 0 : 0,
                image: productForm.image.trim() || "/products/placeholder.png",
                description: productForm.description.trim(),
            };

            if (editingProduct) {
                await api.put(`/admin/products/${editingProduct.id}`, payload);
                showToast("Product updated successfully!");
            } else {
                await api.post("/admin/products", payload);
                showToast("New product added to catalog!");
            }

            setShowProductModal(false);
            // Refresh products
            const pRes = await api.get("/products");
            setProducts(pRes.data || []);
        } catch (err) {
            alert(`Error saving product: ${getApiErrorMessage(err)}`);
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteProduct = async (prodId, prodName) => {
        if (!window.confirm(`Are you sure you want to delete '${prodName}'?`)) return;
        setActionLoading(true);
        try {
            await api.delete(`/admin/products/${prodId}`);
            setProducts((prev) => prev.filter((p) => p.id !== prodId));
            showToast(`Product '${prodName}' deleted.`);
        } catch (err) {
            showToast(`Error: ${getApiErrorMessage(err, "Failed to delete product")}`);
        } finally {
            setActionLoading(false);
        }
    };

    // Quick stock update
    const handleQuickStockChange = async (prodId, newStock) => {
        const parsed = parseInt(newStock, 10);
        if (isNaN(parsed) || parsed < 0) return;

        try {
            await api.patch(`/admin/products/${prodId}/stock`, { stock: parsed });
            setProducts((prev) =>
                prev.map((p) => (p.id === prodId ? { ...p, stock: parsed } : p))
            );
            setStockEditState((prev) => {
                const next = { ...prev };
                delete next[prodId];
                return next;
            });
            showToast("Stock updated!");
        } catch (err) {
            showToast(`Error: ${getApiErrorMessage(err, "Failed to update stock")}`);
        }
    };

    const filteredProducts = useMemo(() => {
        return products.filter((p) => {
            const matchesCat =
                productCategoryFilter === "ALL" || p.category === productCategoryFilter;
            const matchesSearch =
                !productSearch.trim() ||
                p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
                p.brand?.toLowerCase().includes(productSearch.toLowerCase());
            return matchesCat && matchesSearch;
        });
    }, [products, productCategoryFilter, productSearch]);

    const stockProducts = useMemo(() => {
        if (stockFilterLowOnly) {
            return products.filter((p) => (Number(p.stock) || 0) < 10);
        }
        return products;
    }, [products, stockFilterLowOnly]);

    return (
        <div className="admin-dashboard-layout">
            {/* Top Navbar */}
            <header className="admin-navbar">
                <div className="admin-navbar-brand">
                    <span className="brand-logo">🏪</span>
                    <div>
                        <h2>Sanjay Kirana Store</h2>
                        <span className="brand-subtitle">Owner Administration Portal</span>
                    </div>
                </div>

                <div className="admin-navbar-actions">
                    <div className="admin-user-pill">
                        <span className="admin-status-dot"></span>
                        <span>{adminUser?.username || "Owner Admin"}</span>
                        <span className="role-tag">OWNER</span>
                    </div>

                    <Link to="/" className="view-store-btn" title="Return to store homepage">
                        ← View Store
                    </Link>

                    <button onClick={handleLogout} className="admin-logout-btn">
                        Sign Out 🚪
                    </button>
                </div>
            </header>

            {/* Toast Feedback */}
            {toastMessage && <div className="admin-toast">{toastMessage}</div>}

            <main className="admin-main-container">
                {/* Stats Bar */}
                <div className="admin-stats-grid">
                    <div className="stat-card">
                        <span className="stat-icon">📦</span>
                        <div>
                            <span className="stat-label">Total Orders</span>
                            <span className="stat-value">{stats.totalOrders}</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <span className="stat-icon">💰</span>
                        <div>
                            <span className="stat-label">Revenue</span>
                            <span className="stat-value">₹{stats.totalRevenue.toLocaleString("en-IN")}</span>
                        </div>
                    </div>
                    <div className="stat-card highlight">
                        <span className="stat-icon">⏳</span>
                        <div>
                            <span className="stat-label">Pending Orders</span>
                            <span className="stat-value">{stats.pendingCount}</span>
                        </div>
                    </div>
                    <div className={`stat-card ${stats.lowStockCount > 0 ? "warning" : ""}`}>
                        <span className="stat-icon">⚠️</span>
                        <div>
                            <span className="stat-label">Low Stock Alerts</span>
                            <span className="stat-value">{stats.lowStockCount}</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <span className="stat-icon">👥</span>
                        <div>
                            <span className="stat-label">Customers</span>
                            <span className="stat-value">{stats.totalCustomers}</span>
                        </div>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="admin-tab-bar">
                    <button
                        className={`tab-btn ${activeTab === "orders" ? "active" : ""}`}
                        onClick={() => setActiveTab("orders")}
                    >
                        📦 Customer Orders ({orders.length})
                    </button>
                    <button
                        className={`tab-btn ${activeTab === "products" ? "active" : ""}`}
                        onClick={() => setActiveTab("products")}
                    >
                        🛒 Catalog & Products ({products.length})
                    </button>
                    <button
                        className={`tab-btn ${activeTab === "stock" ? "active" : ""}`}
                        onClick={() => setActiveTab("stock")}
                    >
                        ⚡ Stock Management {stats.lowStockCount > 0 && <span className="tab-badge">{stats.lowStockCount}</span>}
                    </button>
                    <button
                        className={`tab-btn ${activeTab === "customers" ? "active" : ""}`}
                        onClick={() => setActiveTab("customers")}
                    >
                        👥 Registered Customers ({customers.length})
                    </button>
                </div>

                {loading ? (
                    <div className="admin-loading-state">
                        <div className="spinner"></div>
                        <p>Loading administration data...</p>
                    </div>
                ) : errorMessage ? (
                    <div className="admin-error-state">
                        <p>⚠️ {errorMessage}</p>
                        <button onClick={fetchAllData} className="retry-btn">Retry</button>
                    </div>
                ) : (
                    <>
                        {/* ==================================================== */}
                        {/* TAB 1: ORDERS MANAGEMENT */}
                        {/* ==================================================== */}
                        {activeTab === "orders" && (
                            <section className="admin-section">
                                <div className="section-toolbar">
                                    <div className="status-filter-pills">
                                        <button
                                            className={`pill ${orderStatusFilter === "ALL" ? "active" : ""}`}
                                            onClick={() => setOrderStatusFilter("ALL")}
                                        >
                                            All ({orders.length})
                                        </button>
                                        {ORDER_STATUSES.map((st) => (
                                            <button
                                                key={st}
                                                className={`pill ${orderStatusFilter === st ? "active" : ""}`}
                                                onClick={() => setOrderStatusFilter(st)}
                                            >
                                                {st} ({orders.filter((o) => (o.status || "Order Placed") === st).length})
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {filteredOrders.length === 0 ? (
                                    <div className="admin-empty-state">
                                        <p>No orders matching status '{orderStatusFilter}'.</p>
                                    </div>
                                ) : (
                                    <div className="orders-table-wrapper">
                                        <table className="admin-table">
                                            <thead>
                                                <tr>
                                                    <th>Order ID</th>
                                                    <th>Customer & Contact</th>
                                                    <th>Delivery Address</th>
                                                    <th>Items</th>
                                                    <th>Total</th>
                                                    <th>Payment</th>
                                                    <th>Status Update</th>
                                                    <th>Details</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredOrders.map((o) => {
                                                    const isExpanded = expandedOrderId === o.id;
                                                    const orderNum = o.order_id || o.orderId || `#${o.id}`;
                                                    const items = Array.isArray(o.items) ? o.items : [];
                                                    return (
                                                        <>
                                                            <tr key={o.id} className={isExpanded ? "expanded-row" : ""}>
                                                                <td>
                                                                    <strong className="order-id-badge">{orderNum}</strong>
                                                                    <span className="order-time">
                                                                        {o.created_at ? new Date(o.created_at).toLocaleDateString("en-IN") : ""}
                                                                    </span>
                                                                </td>
                                                                <td>
                                                                    <div className="customer-cell">
                                                                        <strong>{o.customer_name || o.customerName}</strong>
                                                                        <span>📞 {o.customer_phone || o.customerPhone}</span>
                                                                    </div>
                                                                </td>
                                                                <td>
                                                                    <span className="address-text" title={`${o.delivery_address}, ${o.city} - ${o.pincode}`}>
                                                                        {o.delivery_address}, {o.city}
                                                                    </span>
                                                                </td>
                                                                <td>
                                                                    <span className="items-count-badge">
                                                                        {o.total_items || items.length} items
                                                                    </span>
                                                                </td>
                                                                <td>
                                                                    <strong className="price-text">
                                                                        ₹{o.total_amount || o.total}
                                                                    </strong>
                                                                </td>
                                                                <td>
                                                                    <span className="payment-badge">
                                                                        {o.payment_method?.toUpperCase() || "COD"}
                                                                    </span>
                                                                </td>
                                                                <td>
                                                                    <select
                                                                        className={`status-select ${o.status?.toLowerCase().replace(/\s+/g, "-")}`}
                                                                        value={o.status || "Order Placed"}
                                                                        onChange={(e) => handleUpdateOrderStatus(o.id, e.target.value)}
                                                                        disabled={actionLoading}
                                                                    >
                                                                        {ORDER_STATUSES.map((st) => (
                                                                            <option key={st} value={st}>
                                                                                {st}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                </td>
                                                                <td>
                                                                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                                                        <button
                                                                            className="expand-btn"
                                                                            onClick={() => setExpandedOrderId(isExpanded ? null : o.id)}
                                                                        >
                                                                            {isExpanded ? "Hide ▲" : "View ▼"}
                                                                        </button>
                                                                        <Link
                                                                            to={`/track-order/${o.order_id || o.orderId || o.id}`}
                                                                            target="_blank"
                                                                            className="expand-btn"
                                                                            style={{ textDecoration: "none", color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0" }}
                                                                            title="Open live customer tracking page"
                                                                        >
                                                                            📍 Track
                                                                        </Link>
                                                                    </div>
                                                                </td>
                                                            </tr>

                                                            {/* Expanded items row */}
                                                            {isExpanded && (
                                                                <tr key={`items-${o.id}`} className="items-detail-row">
                                                                    <td colSpan="8">
                                                                        <div className="expanded-order-items">
                                                                            <h4>Ordered Items Breakdown ({items.length}):</h4>
                                                                            <div className="items-grid">
                                                                                {items.map((it, idx) => (
                                                                                    <div className="item-pill" key={idx}>
                                                                                        <img
                                                                                            src={getProductImageUrl(it.image)}
                                                                                            alt={it.product_name || it.name}
                                                                                            className="item-thumb"
                                                                                            onError={(e) => { e.target.src = "/products/placeholder.png"; }}
                                                                                        />
                                                                                        <div>
                                                                                            <strong>{it.product_name || it.name}</strong>
                                                                                            <span>Qty: {it.quantity} × ₹{it.unit_price || it.price}</span>
                                                                                        </div>
                                                                                        <span className="item-subtotal">₹{it.total_price || (it.quantity * it.unit_price)}</span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </section>
                        )}

                        {/* ==================================================== */}
                        {/* TAB 2: PRODUCTS CATALOG MANAGEMENT */}
                        {/* ==================================================== */}
                        {activeTab === "products" && (
                            <section className="admin-section">
                                <div className="catalog-toolbar">
                                    <div className="search-filter-row">
                                        <input
                                            type="text"
                                            placeholder="Search by product name or brand..."
                                            value={productSearch}
                                            onChange={(e) => setProductSearch(e.target.value)}
                                            className="search-input"
                                        />

                                        <select
                                            value={productCategoryFilter}
                                            onChange={(e) => setProductCategoryFilter(e.target.value)}
                                            className="cat-select"
                                        >
                                            <option value="ALL">All Categories</option>
                                            {categories.map((c) => (
                                                <option key={c.name} value={c.name}>
                                                    {c.name} ({c.count || c.product_count})
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <button onClick={handleOpenAddModal} className="add-product-btn">
                                        + Add New Product
                                    </button>
                                </div>

                                <div className="products-table-wrapper">
                                    <table className="admin-table">
                                        <thead>
                                            <tr>
                                                <th>ID</th>
                                                <th>Product</th>
                                                <th>Category</th>
                                                <th>Price (₹)</th>
                                                <th>Original (₹)</th>
                                                <th>Stock</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredProducts.map((p) => (
                                                <tr key={p.id}>
                                                    <td>#{p.id}</td>
                                                    <td>
                                                        <div className="prod-cell">
                                                            <img
                                                                src={getProductImageUrl(p.image)}
                                                                alt={p.name}
                                                                className="table-prod-img"
                                                                onError={(e) => { e.target.src = "/products/placeholder.png"; }}
                                                            />
                                                            <div>
                                                                <strong>{p.name}</strong>
                                                                <span>{p.brand ? `Brand: ${p.brand}` : ""} {p.size ? `(${p.size})` : ""}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className="cat-badge">{p.category}</span>
                                                    </td>
                                                    <td><strong>₹{p.price}</strong></td>
                                                    <td><span className="original-price">₹{p.originalPrice || p.original_price}</span></td>
                                                    <td>
                                                        <span className={`stock-badge ${p.stock < 10 ? "low" : ""}`}>
                                                            {p.stock} units
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div className="action-buttons">
                                                            <button
                                                                className="edit-btn"
                                                                onClick={() => handleOpenEditModal(p)}
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                className="delete-btn"
                                                                onClick={() => handleDeleteProduct(p.id, p.name)}
                                                            >
                                                                Delete
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        )}

                        {/* ==================================================== */}
                        {/* TAB 3: QUICK STOCK MANAGEMENT */}
                        {/* ==================================================== */}
                        {activeTab === "stock" && (
                            <section className="admin-section">
                                <div className="stock-toolbar">
                                    <label className="low-stock-toggle">
                                        <input
                                            type="checkbox"
                                            checked={stockFilterLowOnly}
                                            onChange={(e) => setStockFilterLowOnly(e.target.checked)}
                                        />
                                        <span>Show Only Low-Stock Products (&lt; 10 units)</span>
                                    </label>
                                    <span className="stock-count-info">Showing {stockProducts.length} items</span>
                                </div>

                                <div className="stock-grid">
                                    {stockProducts.map((p) => {
                                        const isEditing = p.id in stockEditState;
                                        const currentVal = isEditing ? stockEditState[p.id] : p.stock;
                                        return (
                                            <div className={`stock-card ${p.stock < 10 ? "alert-low" : ""}`} key={p.id}>
                                                <div className="stock-card-top">
                                                    <img
                                                        src={getProductImageUrl(p.image)}
                                                        alt={p.name}
                                                        className="stock-thumb"
                                                        onError={(e) => { e.target.src = "/products/placeholder.png"; }}
                                                    />
                                                    <div>
                                                        <strong>{p.name}</strong>
                                                        <span className="stock-cat-label">{p.category}</span>
                                                    </div>
                                                </div>

                                                <div className="stock-controls">
                                                    <div className="stock-stepper">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleQuickStockChange(p.id, Math.max(0, p.stock - 1))}
                                                            disabled={p.stock <= 0}
                                                        >
                                                            -
                                                        </button>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={currentVal}
                                                            onChange={(e) => setStockEditState((prev) => ({ ...prev, [p.id]: e.target.value }))}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => handleQuickStockChange(p.id, p.stock + 1)}
                                                        >
                                                            +
                                                        </button>
                                                    </div>

                                                    {isEditing && (
                                                        <button
                                                            className="save-stock-btn"
                                                            onClick={() => handleQuickStockChange(p.id, stockEditState[p.id])}
                                                        >
                                                            Save
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {/* ==================================================== */}
                        {/* TAB 4: REGISTERED CUSTOMERS */}
                        {/* ==================================================== */}
                        {activeTab === "customers" && (
                            <section className="admin-section">
                                <div className="customers-table-wrapper">
                                    <table className="admin-table">
                                        <thead>
                                            <tr>
                                                <th>Customer ID</th>
                                                <th>Name</th>
                                                <th>Phone Number</th>
                                                <th>Registered On</th>
                                                <th>Orders Placed</th>
                                                <th>Total Spent (₹)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {customers.map((c) => (
                                                <tr key={c.id}>
                                                    <td>#{c.id}</td>
                                                    <td><strong>{c.name || "Customer"}</strong></td>
                                                    <td>📞 {c.phone}</td>
                                                    <td>{c.created_at ? new Date(c.created_at).toLocaleDateString("en-IN") : "Recent"}</td>
                                                    <td>
                                                        <span className="items-count-badge">
                                                            {c.total_orders || 0} orders
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <strong className="price-text">
                                                            ₹{(c.total_spent || 0).toLocaleString("en-IN")}
                                                        </strong>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        )}
                    </>
                )}
            </main>

            {/* Add / Edit Product Modal */}
            {showProductModal && (
                <div className="modal-backdrop">
                    <div className="modal-card">
                        <div className="modal-header">
                            <h3>{editingProduct ? `Edit Product #${editingProduct.id}` : "Add New Product to Store"}</h3>
                            <button className="close-btn" onClick={() => setShowProductModal(false)}>×</button>
                        </div>

                        <form onSubmit={handleSaveProduct} className="modal-form">
                            <div className="modal-grid-2">
                                <div className="form-group">
                                    <label>Product Name *</label>
                                    <input
                                        type="text"
                                        value={productForm.name}
                                        onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                                        placeholder="e.g. Fortune Mustard Oil"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Category *</label>
                                    <input
                                        type="text"
                                        list="category-suggestions"
                                        value={productForm.category}
                                        onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                                        placeholder="e.g. Edible Oils & Ghee"
                                        required
                                    />
                                    <datalist id="category-suggestions">
                                        {categories.map((c) => (
                                            <option key={c.name} value={c.name} />
                                        ))}
                                    </datalist>
                                </div>
                            </div>

                            <div className="modal-grid-3">
                                <div className="form-group">
                                    <label>Selling Price (₹) *</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="1"
                                        value={productForm.price}
                                        onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Original MRP (₹)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="1"
                                        value={productForm.originalPrice}
                                        onChange={(e) => setProductForm({ ...productForm, originalPrice: e.target.value })}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Initial Stock *</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={productForm.stock}
                                        onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="modal-grid-3">
                                <div className="form-group">
                                    <label>Brand</label>
                                    <input
                                        type="text"
                                        value={productForm.brand}
                                        onChange={(e) => setProductForm({ ...productForm, brand: e.target.value })}
                                        placeholder="e.g. Fortune"
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Size / Unit</label>
                                    <input
                                        type="text"
                                        value={productForm.size}
                                        onChange={(e) => setProductForm({ ...productForm, size: e.target.value })}
                                        placeholder="e.g. 1 Ltr / 500g"
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Discount (% or text)</label>
                                    <input
                                        type="text"
                                        value={productForm.discount}
                                        onChange={(e) => setProductForm({ ...productForm, discount: e.target.value })}
                                        placeholder="e.g. 10"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Image Path (relative or URL)</label>
                                <input
                                    type="text"
                                    value={productForm.image}
                                    onChange={(e) => setProductForm({ ...productForm, image: e.target.value })}
                                    placeholder="/products/filename.png"
                                />
                            </div>

                            <div className="form-group">
                                <label>Description</label>
                                <textarea
                                    rows="2"
                                    value={productForm.description}
                                    onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                                    placeholder="Product description and details..."
                                ></textarea>
                            </div>

                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="cancel-btn"
                                    onClick={() => setShowProductModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="save-modal-btn"
                                    disabled={actionLoading}
                                >
                                    {actionLoading ? "Saving..." : "Save Product"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default AdminDashboard;

