import { Link, useLocation } from "react-router-dom";
import "./OrderConfirmation.css";

function OrderConfirmation() {
    const { state } = useLocation();

    const order = state?.order;

    if (!order) {
        return (
            <div className="order-not-found">
                <h2>Order not found 😕</h2>

                <Link to="/">
                    Go to Home
                </Link>
            </div>
        );
    }

    return (
        <div className="order-confirmation">

            <div className="confirmation-card">

                <div className="success-icon">
                    ✓
                </div>

                <h1>
                    Order Placed Successfully!
                </h1>

                <p className="success-message">
                    Thank you for shopping with Sanjay Kirana.
                </p>

                <div className="order-id">
                    <span>Order ID</span>
                    <strong>{order.orderId}</strong>
                </div>

                <div className="confirmation-details">

                    <div>
                        <span>Items</span>
                        <strong>{order.totalItems}</strong>
                    </div>

                    <div>
                        <span>Payment</span>
                        <strong>
                            {order.paymentMethod === "cod"
                                ? "Cash on Delivery"
                                : "UPI"}
                        </strong>
                    </div>

                    <div>
                        <span>Total</span>
                        <strong>₹{order.total}</strong>
                    </div>

                </div>

                <div className="delivery-info">

                    <h3>Delivery Details</h3>

                    <p>
                        <strong>{order.address.name}</strong>
                    </p>

                    <p>
                        {order.address.address},{" "}
                        {order.address.city}
                    </p>

                    <p>
                        Pincode: {order.address.pincode}
                    </p>

                    <p>
                        Phone: {order.address.phone}
                    </p>

                </div>

                <div className="confirmation-actions">

                    <Link
                        to="/"
                        className="home-btn"
                    >
                        Continue Shopping
                    </Link>

                </div>

            </div>

        </div>
    );
}

export default OrderConfirmation;