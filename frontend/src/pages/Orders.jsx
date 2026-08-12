import { Link } from "react-router-dom";
import "./Orders.css";

function Orders({ orders }) {
    return (
        <div className="orders-page">

            <h1>My Orders 📦</h1>

            {orders.length === 0 ? (

                <div className="no-orders">

                    <div className="no-orders-icon">
                        📦
                    </div>

                    <h2>No orders yet</h2>

                    <p>
                        Your completed orders will appear here.
                    </p>

                    <Link
                        to="/"
                        className="shop-orders-btn"
                    >
                        Start Shopping
                    </Link>

                </div>

            ) : (

                <div className="orders-list">

                    {orders.map((order) => (

                        <div
                            className="order-card"
                            key={order.orderId}
                        >

                            <div className="order-header">

                                <div>
                                    <span>Order ID</span>

                                    <strong>
                                        {order.orderId}
                                    </strong>
                                </div>

                                <div>
                                    <span>Date</span>

                                    <strong>
                                        {order.date}
                                    </strong>
                                </div>

                                <span className="order-status">
                                    {order.status}
                                </span>

                            </div>

                            <div className="order-products">

                                {order.items.map((item) => (

                                    <div
                                        className="order-product"
                                        key={item.id}
                                    >

                                        <img
                                            src={item.image}
                                            alt={item.name}
                                        />

                                        <div>
                                            <h3>
                                                {item.name}
                                            </h3>

                                            <p>
                                                {item.size} ×{" "}
                                                {item.quantity}
                                            </p>
                                        </div>

                                        <strong>
                                            ₹
                                            {item.price *
                                                item.quantity}
                                        </strong>

                                    </div>

                                ))}

                            </div>

                            <div className="order-footer">

                                <span>
                                    {order.totalItems} items
                                </span>

                                <strong>
                                    Total: ₹{order.total}
                                </strong>

                            </div>

                        </div>

                    ))}

                </div>

            )}

        </div>
    );
}

export default Orders;