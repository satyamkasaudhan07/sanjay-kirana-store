import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar/Navbar";
import Footer from "../components/Footer/Footer";
import api, { API_URL, getApiErrorMessage } from "../utils/api";
import { CATEGORIES } from "../utils/categories";
import { getProductImageUrl } from "../utils/image";
import "./CategoriesPage.css";

function CategoriesPage({ cart, wishlist }) {
    const navigate = useNavigate();
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const fetchCategories = async () => {
        setLoading(true);
        setError("");
        try {
            let categoryList = [];

            // Primary: Fetch from dedicated /categories endpoint (fastest & mobile-ready)
            try {
                const response = await api.get("/categories");
                if (Array.isArray(response.data) && response.data.length > 0) {
                    categoryList = response.data.map((cat) => {
                        const matchedKnown = CATEGORIES.find(
                            (c) => c.name.toLowerCase() === cat.name.toLowerCase()
                        );

                        return {
                            name: cat.name,
                            count: cat.count ?? cat.product_count ?? cat.productCount ?? 0,
                            image: cat.image || null,
                            emoji: matchedKnown?.emoji || "🛒",
                        };
                    });
                }
            } catch (catErr) {
                // If /categories is not available, fallback to grouping /products
                if (import.meta.env.DEV) {
                    console.warn("Direct /categories endpoint fell back to /products aggregation:", catErr);
                }
            }

            // Fallback: If /categories wasn't available, derive from /products
            if (categoryList.length === 0) {
                const response = await api.get("/products");
                const products = Array.isArray(response.data) ? response.data : [];

                const categoryMap = {};
                products.forEach((product) => {
                    const catName = product.category?.trim();
                    if (!catName) return;

                    if (!categoryMap[catName]) {
                        const matchedKnown = CATEGORIES.find(
                            (c) => c.name.toLowerCase() === catName.toLowerCase()
                        );

                        categoryMap[catName] = {
                            name: catName,
                            count: 0,
                            image: product.image || null,
                            emoji: matchedKnown?.emoji || "🛒",
                        };
                    }

                    categoryMap[catName].count += 1;
                    if (!categoryMap[catName].image && product.image) {
                        categoryMap[catName].image = product.image;
                    }
                });

                categoryList = Object.values(categoryMap).sort((a, b) =>
                    a.name.localeCompare(b.name)
                );
            }

            setCategories(categoryList);
        } catch (err) {
            console.error("Error loading categories from API:", err);
            const userFriendlyMsg = getApiErrorMessage(
                err,
                `Unable to load categories. Please check if the Flask backend server is running at ${API_URL}.`
            );
            setError(userFriendlyMsg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCategories();
    }, []);

    const handleCategoryClick = (categoryName) => {
        navigate(`/products?category=${encodeURIComponent(categoryName)}`);
    };

    return (
        <>
            <Navbar cart={cart} wishlist={wishlist} />

            <main className="categories-page">
                <div className="categories-page-header">
                    <h1>Shop by Category</h1>
                    <p>Explore all available groceries and daily essentials by department</p>
                </div>

                {/* Loading State */}
                {loading && (
                    <div className="categories-status-box">
                        <div className="categories-spinner"></div>
                        <h2>Loading Categories...</h2>
                        <p>Fetching the latest product departments from the store.</p>
                    </div>
                )}

                {/* Error State */}
                {!loading && error && (
                    <div className="categories-status-box error">
                        <div className="status-icon">⚠️</div>
                        <h2>Could Not Load Categories</h2>
                        <p className="categories-error-detail">{error}</p>
                        <div className="categories-action-group">
                            <button className="categories-retry-btn" onClick={fetchCategories}>
                                🔄 Retry
                            </button>
                            <button className="categories-home-btn" onClick={() => navigate("/")}>
                                Go to Home
                            </button>
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {!loading && !error && categories.length === 0 && (
                    <div className="categories-status-box">
                        <div className="status-icon">📦</div>
                        <h2>No Categories Found</h2>
                        <p>There are currently no products or categories in the store inventory.</p>
                        <button className="categories-retry-btn" onClick={() => navigate("/")}>
                            Return Home
                        </button>
                    </div>
                )}

                {/* Categories Grid */}
                {!loading && !error && categories.length > 0 && (
                    <div className="categories-page-grid">
                        {categories.map((cat) => (
                            <div
                                key={cat.name}
                                className="categories-page-card"
                                onClick={() => handleCategoryClick(cat.name)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        handleCategoryClick(cat.name);
                                    }
                                }}
                            >
                                <div className="categories-card-visual">
                                    {cat.image ? (
                                        <img
                                            src={getProductImageUrl(cat.image)}
                                            alt={cat.name}
                                            className="categories-card-img"
                                            onError={(e) => {
                                                e.target.style.display = "none";
                                                const fallback = e.target.nextSibling;
                                                if (fallback) fallback.style.display = "block";
                                            }}
                                        />
                                    ) : null}
                                    <span
                                        className="categories-card-emoji"
                                        style={{ display: cat.image ? "none" : "block" }}
                                    >
                                        {cat.emoji}
                                    </span>
                                </div>

                                <div className="categories-card-content">
                                    <h3>{cat.name}</h3>
                                    <span className="categories-count-badge">
                                        {cat.count} {cat.count === 1 ? "Product" : "Products"}
                                    </span>
                                    <span className="categories-page-cta">
                                        View Products →
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
            <Footer />
        </>
    );
}

export default CategoriesPage;
