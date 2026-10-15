import { Link, useParams } from "react-router-dom";
import { FaHeart, FaShoppingCart, FaStar, FaCheckCircle, FaShieldAlt, FaExclamationTriangle } from "react-icons/fa";
import { useEffect, useState } from "react";
import Navbar from "../components/Navbar/Navbar";
import Footer from "../components/Footer/Footer";
import { getProductImageUrl } from "../utils/image";
import api, { getApiErrorMessage } from "../utils/api";
import { isAuthenticated } from "../utils/auth";

import "./ProductDetails.css";

function ProductDetails({
    cart = [],
    setCart,
    wishlist = [],
    setWishlist,
}) {
    const { id } = useParams();

    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Reviews & Ratings state
    const [reviewsData, setReviewsData] = useState({
        summary: { average_rating: 0, total_reviews: 0, rating_breakdown: {} },
        reviews: [],
    });
    const [reviewsLoading, setReviewsLoading] = useState(false);
    const [eligibility, setEligibility] = useState({
        eligible: false,
        eligible_orders: [],
        already_reviewed: false,
    });
    const [newRating, setNewRating] = useState(5);
    const [newReviewText, setNewReviewText] = useState("");
    const [submittingReview, setSubmittingReview] = useState(false);
    const [reviewMessage, setReviewMessage] = useState({ text: "", type: "" });

    // Fetch product details from Flask API
    useEffect(() => {
        const fetchProduct = async () => {
            try {
                const response = await api.get(`/products/${id}`);
                setProduct(response.data);
            } catch (err) {
                console.error("Error fetching product:", err);
                setError(getApiErrorMessage(err, "Product not found."));
            } finally {
                setLoading(false);
            }
        };

        const fetchReviews = async () => {
            setReviewsLoading(true);
            try {
                const res = await api.get(`/products/${id}/reviews`);
                setReviewsData(res.data);
            } catch (err) {
                console.warn("Could not load product reviews:", err);
            } finally {
                setReviewsLoading(false);
            }
        };

        const checkEligibility = async () => {
            if (!isAuthenticated()) return;
            try {
                const res = await api.get(`/products/${id}/review-eligibility`);
                setEligibility(res.data);
            } catch (err) {
                console.warn("Could not check review eligibility:", err);
            }
        };

        fetchProduct();
        fetchReviews();
        checkEligibility();
    }, [id]);

    const isWishlisted = product ? wishlist.some((item) => item.id === product.id) : false;

    const toggleWishlist = () => {
        if (!product || typeof setWishlist !== "function") return;
        if (isWishlisted) {
            setWishlist(wishlist.filter((item) => item.id !== product.id));
        } else {
            setWishlist([...wishlist, product]);
        }
    };

    const cartItem = product ? cart.find((item) => item.id === product.id) : null;

    const addToCart = () => {
        if (!product || typeof setCart !== "function") return;
        if (product.stock <= 0) return;

        if (cartItem) {
            if (cartItem.quantity >= product.stock) return;
            setCart(
                cart.map((item) =>
                    item.id === product.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                )
            );
        } else {
            setCart([...cart, { ...product, quantity: 1 }]);
        }
    };

    const increaseQuantity = () => {
        if (!cartItem || cartItem.quantity >= product.stock) return;
        setCart(
            cart.map((item) =>
                item.id === product.id
                    ? { ...item, quantity: item.quantity + 1 }
                    : item
            )
        );
    };

    const decreaseQuantity = () => {
        if (!cartItem) return;
        if (cartItem.quantity === 1) {
            setCart(cart.filter((item) => item.id !== product.id));
        } else {
            setCart(
                cart.map((item) =>
                    item.id === product.id
                        ? { ...item, quantity: item.quantity - 1 }
                        : item
                )
            );
        }
    };

    const handleSubmitReview = async (e) => {
        e.preventDefault();
        setSubmittingReview(true);
        setReviewMessage({ text: "", type: "" });

        try {
            await api.post(`/products/${id}/reviews`, {
                rating: newRating,
                review_text: newReviewText.trim(),
            });
            setReviewMessage({ text: "Thank you! Your verified review has been submitted.", type: "success" });
            setNewReviewText("");
            // Refresh reviews, eligibility, and product data
            const [revRes, eligRes, prodRes] = await Promise.all([
                api.get(`/products/${id}/reviews`),
                api.get(`/products/${id}/review-eligibility`),
                api.get(`/products/${id}`)
            ]);
            setReviewsData(revRes.data);
            setEligibility(eligRes.data);
            setProduct(prodRes.data);
        } catch (err) {
            const msg = getApiErrorMessage(err, "Failed to submit review.");
            setReviewMessage({ text: msg, type: "error" });
        } finally {
            setSubmittingReview(false);
        }
    };

    return (
        <>
            <Navbar cart={cart} wishlist={wishlist} />

            <main className="product-details-page">
                <div className="product-details-container">
                    <Link to="/products" className="back-link">
                        ← Back to All Products
                    </Link>

                    {loading && (
                        <div className="details-status-card">
                            <div className="details-spinner" />
                            <h2>Loading Product Details...</h2>
                            <p>Fetching specifications and live stock from Sanjay Kirana Store.</p>
                        </div>
                    )}

                    {!loading && (error || !product) && (
                        <div className="details-status-card error">
                            <div className="status-icon">📦</div>
                            <h2>Product Not Found</h2>
                            <p>{error || "The product you requested does not exist or has been removed."}</p>
                            <Link to="/products" className="details-return-btn">
                                Browse Other Products
                            </Link>
                        </div>
                    )}

                    {!loading && !error && product && (
                        <>
                            <div className="product-details">
                            {/* Left Image Section */}
                            <div className="details-image-section">
                                <img
                                    src={getProductImageUrl(product.image)}
                                    alt={product.name}
                                    className="details-image"
                                    onError={(e) => {
                                        e.target.src = "/hero.png";
                                    }}
                                />

                                <button
                                    className={`details-wishlist ${isWishlisted ? "wishlisted" : ""}`}
                                    onClick={toggleWishlist}
                                    aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
                                >
                                    <FaHeart />
                                </button>
                            </div>

                            {/* Right Info Section */}
                            <div className="details-info-section">
                                <span className="details-category-badge">{product.category}</span>
                                <h1>{product.name}</h1>
                                <p className="details-brand">Brand: <strong>{product.brand}</strong></p>
                                <p className="details-size">Package Size: <strong>{product.size} {product.unit || ""}</strong></p>

                                <div className="details-rating-row">
                                    <FaStar className="details-star" />
                                    <span className="details-rating-val">{product.rating}</span>
                                    <span className="details-reviews-count">({product.totalReviews || 0} reviews)</span>
                                </div>

                                <div className="details-price-row">
                                    <span className="details-price">₹{product.price}</span>
                                    {product.discount > 0 && (
                                        <>
                                            <span className="details-old-price">₹{product.originalPrice}</span>
                                            <span className="details-discount-chip">{product.discount}% OFF</span>
                                        </>
                                    )}
                                </div>

                                <div className="details-stock-status">
                                    {product.stock > 0 ? (
                                        <span className="in-stock-tag">✓ In Stock ({product.stock} available)</span>
                                    ) : (
                                        <span className="out-of-stock-tag">✕ Currently Out of Stock</span>
                                    )}
                                </div>

                                <div className="details-divider" />

                                <h3>About this Product</h3>
                                <p className="details-description">
                                    {product.description ||
                                        `Genuine, high-quality ${product.name} by ${product.brand}. Packed with care and delivered directly from Sanjay Kirana Store in Harraiya.`}
                                </p>

                                <div className="details-action-box">
                                    {product.stock > 0 ? (
                                        cartItem ? (
                                            <div className="details-quantity-stepper">
                                                <button onClick={decreaseQuantity} aria-label="Decrease quantity">−</button>
                                                <span>{cartItem.quantity} in cart</span>
                                                <button
                                                    onClick={increaseQuantity}
                                                    disabled={cartItem.quantity >= product.stock}
                                                    aria-label="Increase quantity"
                                                >
                                                    +
                                                </button>
                                            </div>
                                        ) : (
                                            <button className="details-add-btn" onClick={addToCart}>
                                                <FaShoppingCart />
                                                Add to Cart
                                            </button>
                                        )
                                    ) : (
                                        <button className="details-add-btn disabled" disabled>
                                            Out of Stock
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* VERIFIED REVIEWS & RATINGS SECTION */}
                        <section className="product-reviews-section">
                            <div className="reviews-section-header">
                                <h2>Customer Ratings & Verified Reviews</h2>
                                <p>Genuine feedback from verified buyers in Harraiya.</p>
                            </div>

                            <div className="reviews-overview-grid">
                                {/* Overall Summary Box */}
                                <div className="ratings-summary-box">
                                    <div className="overall-score-col">
                                        <span className="big-rating-number">
                                            {reviewsData.summary?.average_rating || product.rating || "0.0"}
                                        </span>
                                        <div className="big-stars-row">
                                            {[1, 2, 3, 4, 5].map((star) => (
                                                <FaStar
                                                    key={star}
                                                    className={`big-star ${star <= Math.round(reviewsData.summary?.average_rating || product.rating || 0) ? "filled" : "empty"}`}
                                                />
                                            ))}
                                        </div>
                                        <span className="total-ratings-count">
                                            Based on {reviewsData.summary?.total_reviews || product.totalReviews || 0} reviews
                                        </span>
                                    </div>

                                    {/* Breakdown Bars */}
                                    <div className="ratings-breakdown-col">
                                        {[5, 4, 3, 2, 1].map((stars) => {
                                            const total = reviewsData.summary?.total_reviews || 0;
                                            const count = reviewsData.summary?.rating_breakdown?.[stars] || 0;
                                            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                                            return (
                                                <div key={stars} className="breakdown-bar-row">
                                                    <span className="star-label">{stars} ★</span>
                                                    <div className="progress-track">
                                                        <div className="progress-fill" style={{ width: `${pct}%` }} />
                                                    </div>
                                                    <span className="count-label">{count}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Write a Review Box (Eligibility Aware) */}
                                <div className="write-review-card">
                                    <h3>Write a Review</h3>
                                    {reviewMessage.text && (
                                        <div className={`review-status-banner ${reviewMessage.type}`}>
                                            {reviewMessage.type === "success" ? <FaCheckCircle /> : <FaExclamationTriangle />}
                                            <span>{reviewMessage.text}</span>
                                        </div>
                                    )}

                                    {!isAuthenticated() ? (
                                        <div className="review-eligibility-notice">
                                            <p>Only verified buyers can review products. Sign in with your mobile number to review products you've received.</p>
                                            <Link to="/login" className="review-login-btn">
                                                Sign In to Review
                                            </Link>
                                        </div>
                                    ) : eligibility.eligible ? (
                                        <form onSubmit={handleSubmitReview} className="submit-review-form">
                                            <div className="form-group">
                                                <label>Your Rating <span className="req">*</span></label>
                                                <div className="interactive-stars-row">
                                                    {[1, 2, 3, 4, 5].map((s) => (
                                                        <button
                                                            key={s}
                                                            type="button"
                                                            className={`star-pick-btn ${s <= newRating ? "active" : ""}`}
                                                            onClick={() => setNewRating(s)}
                                                        >
                                                            <FaStar />
                                                        </button>
                                                    ))}
                                                    <span className="star-score-text">{newRating} / 5 Stars</span>
                                                </div>
                                            </div>

                                            <div className="form-group">
                                                <label htmlFor="prod_review_text">Review Commentary (Optional)</label>
                                                <textarea
                                                    id="prod_review_text"
                                                    value={newReviewText}
                                                    onChange={(e) => setNewReviewText(e.target.value)}
                                                    placeholder="Tell Harraiya shoppers about freshness, packaging, and quality..."
                                                    rows="3"
                                                    maxLength="1000"
                                                />
                                            </div>

                                            <button
                                                type="submit"
                                                className="submit-review-btn"
                                                disabled={submittingReview}
                                            >
                                                {submittingReview ? "Submitting..." : "Submit Verified Review"}
                                            </button>
                                        </form>
                                    ) : eligibility.already_reviewed ? (
                                        <div className="review-eligibility-notice success">
                                            <FaCheckCircle className="notice-icon" />
                                            <div>
                                                <strong>Review Submitted!</strong>
                                                <p>You have already reviewed this product for your recent delivered order. Thank you for your feedback!</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="review-eligibility-notice">
                                            <FaShieldAlt className="notice-icon" />
                                            <div>
                                                <strong>Verified Purchase Only</strong>
                                                <p>To ensure 100% genuine reviews, only customers who have received this product in a completed delivered order can review it.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Reviews List */}
                            <div className="reviews-list-container">
                                <h3>Customer Reviews ({reviewsData.reviews?.length || 0})</h3>
                                {reviewsLoading ? (
                                    <div className="reviews-loading">
                                        <div className="details-spinner" />
                                        <p>Loading verified reviews...</p>
                                    </div>
                                ) : reviewsData.reviews?.length === 0 ? (
                                    <div className="no-reviews-box">
                                        <p>No verified customer reviews yet for this product. Be the first to order and review!</p>
                                    </div>
                                ) : (
                                    <div className="customer-reviews-grid">
                                        {reviewsData.reviews.map((rev) => (
                                            <div key={rev.id} className="customer-review-card">
                                                <div className="review-card-top-row">
                                                    <div>
                                                        <div className="reviewer-name-row">
                                                            <strong>{rev.customer_name || rev.customerName || "Customer"}</strong>
                                                            <span className="verified-buyer-badge">
                                                                <FaCheckCircle /> Verified Purchase
                                                            </span>
                                                        </div>
                                                        <span className="review-date-str">
                                                            {rev.created_at ? new Date(rev.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Recently"}
                                                        </span>
                                                    </div>
                                                    <div className="review-stars-group">
                                                        {[1, 2, 3, 4, 5].map((s) => (
                                                            <FaStar
                                                                key={s}
                                                                className={`card-star ${s <= rev.rating ? "filled" : "empty"}`}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>

                                                <p className="review-comment-text">
                                                    "{rev.review_text || rev.reviewText || "Quality verified by customer."}"
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </section>
                        </>
                    )}
                </div>
            </main>

            <Footer />
        </>
    );
}

export default ProductDetails;