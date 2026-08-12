import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import "./Checkout.css";

function Checkout({ cart, setCart, setOrders }) {
    const navigate = useNavigate();

    const [address, setAddress] = useState({
        name: "",
        phone: "",
        address: "",
        city: "",
        pincode: "",
    });

    const [paymentMethod, setPaymentMethod] = useState("cod");

    const subtotal = cart.reduce(
        (sum, item) => sum + item.price * item.quantity,
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
        (sum, item) => sum + item.quantity,
        0
    );

    const handleChange = (e) => {
        setAddress({
            ...address,
            [e.target.name]: e.target.value,
        });
    };

    const placeOrder = (e) => {
        e.preventDefault();

        if (cart.length === 0) {
            return;
        }

        const totalItems = cart.reduce(
            (sum, item) => sum + item.quantity,
            0
        );

        const order = {
            orderId: `SK${Date.now()}`,
            items: cart,
            address,
            paymentMethod,
            subtotal,
            deliveryCharge,
            total,
            totalItems,
            date: new Date().toLocaleString(),
            status: "Order Placed",
        };

        // Save order to order history
        setOrders((previousOrders) => [
            order,
            ...previousOrders,
        ]);

        // Empty cart
        setCart([]);

        // Go to confirmation page
        navigate("/order-confirmation", {
            state: {
                order,
            },
        });
    };

    if (cart.length === 0) {
        return (
            <div className="checkout-empty">

                <h2>Your cart is empty 🛒</h2>

                <p>
                    Add some products before proceeding to checkout.
                </p>

                <Link to="/">
                    Continue Shopping
                </Link>

            </div>
        );
    }

    return (
        <div className="checkout-page">

            <Link to="/cart" className="back-to-cart">
                ← Back to Cart
            </Link>

            <h1>Checkout</h1>

            <form
                className="checkout-layout"
                onSubmit={placeOrder}
            >

                {/* LEFT SIDE */}

                <div className="checkout-left">

                    {/* Delivery Address */}

                    <div className="checkout-card">

                        <h2>Delivery Address</h2>

                        <div className="form-grid">

                            <div className="form-group">
                                <label>
                                    Full Name
                                </label>

                                <input
                                    type="text"
                                    name="name"
                                    value={address.name}
                                    onChange={handleChange}
                                    placeholder="Enter your name"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>
                                    Phone Number
                                </label>

                                <input
                                    type="tel"
                                    name="phone"
                                    value={address.phone}
                                    onChange={handleChange}
                                    placeholder="Enter phone number"
                                    required
                                />
                            </div>

                            <div className="form-group full-width">
                                <label>
                                    Address
                                </label>

                                <textarea
                                    name="address"
                                    value={address.address}
                                    onChange={handleChange}
                                    placeholder="House no., street, area"
                                    rows="3"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>
                                    City
                                </label>

                                <input
                                    type="text"
                                    name="city"
                                    value={address.city}
                                    onChange={handleChange}
                                    placeholder="Enter city"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>
                                    Pincode
                                </label>

                                <input
                                    type="text"
                                    name="pincode"
                                    value={address.pincode}
                                    onChange={handleChange}
                                    placeholder="6-digit pincode"
                                    maxLength="6"
                                    required
                                />
                            </div>

                        </div>

                    </div>


                    {/* Payment */}

                    <div className="checkout-card">

                        <h2>Payment Method</h2>

                        <label className="payment-option">

                            <input
                                type="radio"
                                name="payment"
                                value="cod"
                                checked={paymentMethod === "cod"}
                                onChange={(e) =>
                                    setPaymentMethod(e.target.value)
                                }
                            />

                            <div>
                                <strong>
                                    Cash on Delivery
                                </strong>

                                <p>
                                    Pay when your order arrives
                                </p>
                            </div>

                        </label>

                        <label className="payment-option">

                            <input
                                type="radio"
                                name="payment"
                                value="upi"
                                checked={paymentMethod === "upi"}
                                onChange={(e) =>
                                    setPaymentMethod(e.target.value)
                                }
                            />

                            <div>
                                <strong>
                                    UPI
                                </strong>

                                <p>
                                    Pay using UPI
                                </p>
                            </div>

                        </label>

                    </div>

                </div>


                {/* RIGHT SIDE */}

                <div className="checkout-summary">

                    <h2>Order Summary</h2>

                    <div className="summary-items">

                        {cart.map((item) => (

                            <div
                                className="summary-item"
                                key={item.id}
                            >

                                <img
                                    src={item.image}
                                    alt={item.name}
                                />

                                <div>
                                    <h4>
                                        {item.name}
                                    </h4>

                                    <p>
                                        {item.quantity} × ₹{item.price}
                                    </p>
                                </div>

                                <strong>
                                    ₹{item.price * item.quantity}
                                </strong>

                            </div>

                        ))}

                    </div>

                    <div className="checkout-divider" />

                    <div className="summary-row">
                        <span>
                            Items ({totalItems})
                        </span>

                        <span>
                            ₹{subtotal}
                        </span>
                    </div>

                    <div className="summary-row">
                        <span>
                            Delivery
                        </span>

                        <span>
                            {deliveryCharge === 0
                                ? "FREE"
                                : `₹${deliveryCharge}`}
                        </span>
                    </div>

                    <div className="checkout-divider" />

                    <div className="checkout-total">

                        <span>
                            Total
                        </span>

                        <strong>
                            ₹{total}
                        </strong>

                    </div>

                    <button
                        type="submit"
                        className="place-order-btn"
                    >
                        Place Order
                    </button>

                </div>

            </form>

        </div>
    );
}

export default Checkout;