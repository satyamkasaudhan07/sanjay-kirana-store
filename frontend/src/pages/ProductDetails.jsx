import { Link, useParams } from "react-router-dom";
import { FaHeart, FaShoppingCart, FaStar } from "react-icons/fa";
import { useEffect, useState } from "react";
import axios from "axios";
import { getProductImageUrl } from "../utils/image";

import "./ProductDetails.css";

function ProductDetails({
    cart,
    setCart,
    wishlist,
    setWishlist,
}) {
    const { id } = useParams();

    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Fetch product from Flask API
    useEffect(() => {
        const fetchProduct = async () => {
            try {
                const response = await axios.get(
                    `http://127.0.0.1:5000/products/${id}`
                );

                setProduct(response.data);
            } catch (err) {
                console.error("Error fetching product:", err);
                setError("Product not found.");
            } finally {
                setLoading(false);
            }
        };

        fetchProduct();
    }, [id]);

    // Loading
    if (loading) {
        return (
            <div className="product-not-found">
                <h2>Loading product...</h2>
            </div>
        );
    }

    // Error / product not found
    if (error || !product) {
        return (
            <div className="product-not-found">
                <h2>Product not found 😕</h2>

                <Link to="/">
                    Back to Home
                </Link>
            </div>
        );
    }

    const cartItem = cart.find(
        (item) => item.id === product.id
    );

    const isWishlisted = wishlist.some(
        (item) => item.id === product.id
    );

    const toggleWishlist = () => {
        if (isWishlisted) {
            setWishlist(
                wishlist.filter(
                    (item) => item.id !== product.id
                )
            );
        } else {
            setWishlist([
                ...wishlist,
                product,
            ]);
        }
    };

    const addToCart = () => {
        if (cartItem) {
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
        } else {
            setCart([
                ...cart,
                {
                    ...product,
                    quantity: 1,
                },
            ]);
        }
    };

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
        if (!cartItem) {
            return;
        }

        if (cartItem.quantity === 1) {
            setCart(
                cart.filter(
                    (item) => item.id !== product.id
                )
            );
        } else {
            setCart(
                cart.map((item) =>
                    item.id === product.id
                        ? {
                              ...item,
                              quantity: item.quantity - 1,
                          }
                        : item
                )
            );
        }
    };

    return (
        <div className="product-details-page">

            <Link
                to="/"
                className="back-link"
            >
                ← Continue Shopping
            </Link>

            <div className="product-details">

                {/* Image */}

                <div className="details-image-section">

                    <button
                        className={`details-wishlist ${
                            isWishlisted
                                ? "wishlisted"
                                : ""
                        }`}
                        onClick={toggleWishlist}
                    >
                        <FaHeart />
                    </button>

                    <img
                        src={getProductImageUrl(product.image)}
                        alt={product.name}
                        className="details-image"
                    />

                </div>

                {/* Information */}

                <div className="details-info">

                    <p className="details-brand">
                        {product.brand}
                    </p>

                    <h1>
                        {product.name}
                    </h1>

                    <p className="details-size">
                        {product.size}{" "}
                        {product.unit}
                    </p>

                    <div className="details-rating">

                        <span>
                            <FaStar />
                            {product.rating}
                        </span>

                        <span>
                            ({product.totalReviews} reviews)
                        </span>

                    </div>

                    <div className="details-price">

                        <span className="details-current-price">
                            ₹{product.price}
                        </span>

                        {product.discount > 0 && (
                            <>
                                <span className="details-old-price">
                                    ₹{product.originalPrice}
                                </span>

                                <span className="details-discount">
                                    {product.discount}% OFF
                                </span>
                            </>
                        )}

                    </div>

                    <div className="details-divider" />

                    <h3>
                        About this product
                    </h3>

                    <p className="details-description">
                        {product.description ||
                            `High-quality ${product.name} from ${product.brand}. Perfect for your everyday needs.`}
                    </p>

                    <div className="details-stock">

                        {product.stock > 0
                            ? "✓ In Stock"
                            : "Out of Stock"}

                    </div>

                    {product.stock > 0 && (

                        cartItem ? (

                            <div className="details-quantity">

                                <button
                                    onClick={
                                        decreaseQuantity
                                    }
                                >
                                    −
                                </button>

                                <span>
                                    {cartItem.quantity}
                                </span>

                                <button
                                    onClick={
                                        increaseQuantity
                                    }
                                >
                                    +
                                </button>

                            </div>

                        ) : (

                            <button
                                className="details-add-btn"
                                onClick={addToCart}
                            >
                                <FaShoppingCart />
                                Add to Cart
                            </button>

                        )

                    )}

                </div>

            </div>

        </div>
    );
}

export default ProductDetails;