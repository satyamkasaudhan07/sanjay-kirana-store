import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import Navbar from "../components/Navbar/Navbar";
import { getProductImageUrl } from "../utils/image";
import "./Checkout.css";

function Checkout({ cart, setCart, wishlist = [], setOrders }) {
    const navigate = useNavigate();

    // Form state
    const [address, setAddress] = useState({
        name: "",
        phone: "",
        address: "",
        city: "",
        pincode: "",
    });

    const [paymentMethod, setPaymentMethod] = useState("cod");

    // UI state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [completedOrder, setCompletedOrder] = useState(null);

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
            items: cart.map((item) => ({
                product_id: parseInt(item.id, 10),
                quantity: parseInt(item.quantity, 10) || 1,
            })),
        };

        try {
            const response = await axios.post(
                "http://127.0.0.1:5000/orders",
                orderPayload,
                {
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            );

            if (response.status === 201) {
                const createdOrder = response.data.order;

                // Save order to history if handler provided
                if (typeof setOrders === "function") {
                    setOrders((prevOrders) => [createdOrder, ...(prevOrders || [])]);
                }

                // Clear the cart state
                setCart([]);

                // Set completed order to show in-page order-success screen
                setCompletedOrder(createdOrder);
            }
        } catch (error) {
            console.error("Order placement failed:", error);
            const serverError =
                error.response?.data?.error ||
                error.response?.data?.message ||
                "Failed to place your order. Please check your details and try again.";
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

                            <div className="success-actions">
                                <button
                                    className="continue-shopping-btn"
                                    onClick={() => navigate("/")}
                                >
                                    Continue Shopping
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
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

                    {errorMessage && (
                        <div className="checkout-error-banner" role="alert">
                            <span className="error-icon">⚠️</span>
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    <form className="checkout-layout" onSubmit={handlePlaceOrder}>
                        {/* LEFT COLUMN: Delivery & Payment Details */}
                        <div className="checkout-left">
                            {/* Delivery Address Section */}
                            <div className="checkout-card">
                                <h2>1. Delivery Information</h2>

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

                            {/* Payment Method Section */}
                            <div className="checkout-card">
                                <h2>2. Payment Method</h2>

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
        </>
    );
}

export default Checkout;