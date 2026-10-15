import "./Hero.css";
import { useNavigate } from "react-router-dom";

function Hero({ search, setSearch }) {
    const navigate = useNavigate();

    return (
        <section className="hero-section">
            <div className="hero-main-container">
                <div className="hero-content">
                    <div className="hero-pill-badge">
                        <span>🏪</span>
                        <span>Harraiya, Basti (PIN 272155) · 2 km Delivery Radius</span>
                    </div>

                    <h1>
                        Daily Essentials
                        <span className="hero-headline-highlight">Delivered to Your Door</span>
                    </h1>

                    <p className="hero-description">
                        We deliver within a 2 km radius of Sanjay Kirana Store, Harraiya, Basti (PIN 272155). Order daily staples and groceries with fast local doorstep delivery. For assistance, call <a href="tel:+919919193538" className="hero-phone-link">9919193538</a>.
                    </p>

                    {/* Integrated Search Bar */}
                    <div className="hero-search-box">
                        <span className="hero-search-icon">🔍</span>
                        <input
                            type="text"
                            placeholder="Search dal, oil, biscuits, spices, soaps and more..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            aria-label="Search products"
                        />
                        {search && (
                            <button
                                className="hero-search-clear"
                                onClick={() => setSearch("")}
                                aria-label="Clear search text"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* Navigation Buttons */}
                    <div className="hero-actions">
                        <button
                            className="hero-btn-primary"
                            onClick={() => navigate("/products")}
                        >
                            🛒 Shop All Products
                        </button>
                        <button
                            className="hero-btn-secondary"
                            onClick={() => navigate("/categories")}
                        >
                            📦 Browse Categories
                        </button>
                    </div>
                </div>

                {/* Hero Asset */}
                <div className="hero-visual">
                    <img
                        src="/hero.png"
                        alt="Sanjay Kirana Store packaged daily kirana essentials"
                        className="hero-image"
                    />
                </div>
            </div>

            {/* Verified Trust Badges Bar */}
            <div className="hero-trust-bar">
                <div className="hero-trust-container">
                    <div className="hero-trust-item">
                        <span className="trust-icon">📍</span>
                        <div>
                            <strong>Harraiya (PIN 272155)</strong>
                            <span>Locally owned & operated</span>
                        </div>
                    </div>
                    <div className="hero-trust-item">
                        <span className="trust-icon">🛵</span>
                        <div>
                            <strong>2 km Delivery Radius</strong>
                            <span>Free on orders ₹500+</span>
                        </div>
                    </div>
                    <div className="hero-trust-item">
                        <span className="trust-icon">💵</span>
                        <div>
                            <strong>Cash on Delivery & UPI</strong>
                            <span>Pay securely when delivered</span>
                        </div>
                    </div>
                    <div className="hero-trust-item">
                        <span className="trust-icon">🌾</span>
                        <div>
                            <strong>Trusted Brands</strong>
                            <span>Quality checked groceries</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

export default Hero;