import Navbar from "../components/Navbar/Navbar";
import Footer from "../components/Footer/Footer";
import { useNavigate } from "react-router-dom";
import { getProductImageUrl } from "../utils/image";
import "./Cart.css";
function Cart({ cart, setCart, wishlist }) {
    const navigate = useNavigate();

    const increaseQuantity = (id) => {
        const updatedCart = cart.map((item) => {

            if (item.id === id) {

                if (item.quantity >= item.stock) {
                    return item;
                }

                return {
                    ...item,
                    quantity: item.quantity + 1,
                };
            }

            return item;
        });

        setCart(updatedCart);
    };

    const decreaseQuantity = (id) => {
        const updatedCart = cart
            .map((item) => {
                if (item.id === id) {
                    return {
                        ...item,
                        quantity: item.quantity - 1,
                    };
                }

                return item;
            })
            .filter((item) => item.quantity > 0);

        setCart(updatedCart);
    };

    const removeItem = (id) => {
        const updatedCart = cart.filter(
            (item) => item.id !== id
        );

        setCart(updatedCart);
    };

    const subtotal = cart.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
    );

    const deliveryCharge = subtotal === 0
        ? 0
        : subtotal >= 500
            ? 0
            : 40;

    const total = subtotal + deliveryCharge;

    const totalItems = cart.reduce(
        (sum, item) => sum + item.quantity,
        0
    );

    return (
        <>
            <Navbar cart={cart}
                wishlist={wishlist} />

            <div className="cart-page">

                <h1>Your Cart 🛒</h1>

                {cart.length === 0 ? (

                    <div className="empty-cart">

                        <div className="empty-cart-icon">
                            🛒
                        </div>

                        <h2>Your Cart is Empty</h2>

                        <p>
                            Looks like you haven't added anything yet.
                        </p>

                        <button
                            className="continue-shopping"
                            onClick={() => navigate("/products")}
                        >
                            Start Shopping
                        </button>

                    </div>

                ) : (

                    <div className="cart-layout">

                        {/* Cart Items */}

                        <div className="cart-items">

                            {cart.map((item) => (

                                <div
                                    className="cart-item"
                                    key={item.id}
                                >

                                    <div className="cart-image-container">
                                        <img
                                            src={getProductImageUrl(item.image)}
                                            alt={item.name}
                                        />
                                    </div>

                                    <div className="cart-details">

                                        <h3>
                                            {item.name}
                                        </h3>

                                        <p className="cart-size">
                                            {item.size} {item.unit}
                                        </p>

                                        <p className="cart-price">
                                            ₹{item.price}
                                        </p>

                                        <div className="cart-bottom">

                                            <div className="quantity">

                                                <button
                                                    onClick={() =>
                                                        decreaseQuantity(item.id)
                                                    }
                                                >
                                                    −
                                                </button>

                                                <span>
                                                    {item.quantity}
                                                </span>

                                                <button
                                                    onClick={() => increaseQuantity(item.id)}
                                                    disabled={
                                                        item.quantity >= item.stock
                                                    }
                                                >
                                                    +
                                                </button>

                                            </div>

                                            <strong>
                                                ₹{item.price * item.quantity}
                                            </strong>

                                        </div>

                                        <button
                                            className="remove-btn"
                                            onClick={() =>
                                                removeItem(item.id)
                                            }
                                        >
                                            Remove
                                        </button>

                                    </div>

                                </div>

                            ))}

                        </div>

                        {/* Cart Summary */}

                        <div className="cart-summary">

                            <h2>
                                Cart Summary
                            </h2>

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

                            {subtotal > 0 && subtotal < 500 && (
                                <div className="free-delivery-message">
                                    <div className="delivery-progress-track">
                                        <div
                                            className="delivery-progress-fill"
                                            style={{ width: `${Math.min(100, (subtotal / 500) * 100)}%` }}
                                        />
                                    </div>
                                    <p>
                                        Add <strong>₹{500 - subtotal}</strong> more for <strong>FREE delivery</strong> 🎉
                                    </p>
                                </div>
                            )}

                            {subtotal >= 500 && (
                                <div className="free-delivery-message unlocked">
                                    <p>🎉 You've unlocked <strong>FREE delivery!</strong></p>
                                </div>
                            )}

                            <div className="summary-divider" />

                            <div className="summary-total">
                                <span>
                                    Total
                                </span>

                                <strong>
                                    ₹{total}
                                </strong>
                            </div>

                            <button className="checkout-btn"
                                onClick={() => navigate("/checkout")}>
                                Proceed to Checkout
                            </button>

                        </div>

                    </div>

                )}

            </div>
            <Footer />
        </>
    );
}

export default Cart;