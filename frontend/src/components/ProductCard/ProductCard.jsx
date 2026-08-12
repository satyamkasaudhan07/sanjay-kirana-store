import "./ProductCard.css";
import { FaHeart, FaShoppingCart, FaStar } from "react-icons/fa";
import { Link } from "react-router-dom";
function ProductCard({ product, cart, setCart, wishlist, setWishlist }) {
    const {
        id,
        image,
        name,
        brand,
        category,
        subCategory,
        size,
        unit,
        description,
        price,
        originalPrice,
        discount,
        rating,
        totalReviews,
        stock,
        featured,
        bestseller,
    } = product;


    const addToCart = () => {
        const existingProduct = cart.find(
            (item) => item.id === id
        );

        if (existingProduct) {

            if (existingProduct.quantity >= stock) {
                return;
            }

            const updatedCart = cart.map((item) =>
                item.id === id
                    ? {
                        ...item,
                        quantity: item.quantity + 1,
                    }
                    : item
            );

            setCart(updatedCart);

        } else {

            if (stock <= 0) {
                return;
            }

            setCart([
                ...cart,
                {
                    ...product,
                    quantity: 1,
                },
            ]);
        }
    };
    const cartItem = cart.find((item) => item.id === id);

    const increaseQuantity = () => {

    if (!cartItem) {
        return;
    }

    if (cartItem.quantity >= product.stock) {
        return;
    }

    setCart(
        cart.map((item) =>
            item.id === product.id
                ? {
                    ...item,
                    quantity: item.quantity + 1,
                }
                : item
        )
    );
};

    const decreaseQuantity = () => {
        if (cartItem.quantity === 1) {
            setCart(cart.filter((item) => item.id !== id));
        } else {
            setCart(
                cart.map((item) =>
                    item.id === id
                        ? { ...item, quantity: item.quantity - 1 }
                        : item
                )
            );
        }
    };
    const isWishlisted = wishlist.some(
        (item) => item.id === id
    );

    const toggleWishlist = () => {
        if (isWishlisted) {
            setWishlist(
                wishlist.filter((item) => item.id !== id)
            );
        } else {
            setWishlist([
                ...wishlist,
                product,
            ]);
        }
    };

    return (
        <div className="product-card">

            {/* Wishlist */}
            <button
                className={`wishlist-btn ${isWishlisted ? "wishlisted" : ""
                    }`}
                onClick={toggleWishlist}
            >
                <FaHeart />
            </button>

            {/* Product Image */}
            <Link
                to={`/product/${id}`}
                className="product-image-link"
            >
                <div className="product-image-container">
                    <img
                        src={image}
                        alt={name}
                        className="product-image"
                    />
                </div>
            </Link>
            {/* Product Info */}
            <div className="product-info">

                <Link
                    to={`/product/${id}`}
                    className="product-name-link"
                >
                    <h3>{name}</h3>
                </Link>
                <p className="product-brand">{brand}</p>
                <p className="product-size">
                    {size} {unit}
                </p>

                <div className="rating-row">
                    <FaStar className="star-icon" />

                    <span className="rating">
                        {rating}
                    </span>

                    <span className="reviews">
                        ({totalReviews})
                    </span>
                </div>

                <div className="price-row">

                    <div>

                        <span className="price">
                            ₹{price}
                        </span>

                        {discount > 0 && (
                            <span className="old-price">
                                ₹{originalPrice}
                            </span>
                        )}

                    </div>

                    {discount > 0 && (
                        <span className="discount-chip">
                            {discount}% OFF
                        </span>
                    )}

                </div>
                {stock === 0 ? (
                    <button className="add-btn" disabled>
                        Out of Stock
                    </button>
                ) : cartItem ? (
                    <div className="quantity-box">

                        <button
                            className="qty-btn"
                            onClick={decreaseQuantity}
                        >
                            −
                        </button>

                        <span className="qty-number">
                            {cartItem.quantity}
                        </span>

                        <button
                            className="qty-btn"
                            onClick={increaseQuantity}
                        >
                            +
                        </button>

                    </div>
                ) : (
                    <button
                        className="add-btn"
                        onClick={addToCart}
                        disabled={
                            stock === 0 ||
                            cart.some(
                                (item) =>
                                    item.id === id &&
                                    item.quantity >= stock
                            )
                        }
                    >
                        <FaShoppingCart />

                        {stock === 0
                            ? "Out of Stock"
                            : cart.some(
                                (item) =>
                                    item.id === id &&
                                    item.quantity >= stock
                            )
                                ? "Stock Limit Reached"
                                : "ADD"}
                    </button>
                )}
            </div>

        </div>
    );
}

export default ProductCard;