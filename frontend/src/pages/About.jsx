import { Link } from "react-router-dom";
import Navbar from "../components/Navbar/Navbar";
import Footer from "../components/Footer/Footer";
import { CATEGORIES } from "../utils/categories";
import "./About.css";

function About({ cart, wishlist }) {
    return (
        <>
            <Navbar cart={cart} wishlist={wishlist} />

            <main className="about-page">

                {/* Hero */}
                <section className="about-hero">
                    <div className="about-hero-badge">🛒 Local · Authentic · Trusted</div>
                    <h1>About Sanjay Kirana Store</h1>
                    <p>
                        Your trusted neighbourhood grocery store, now online — bringing
                        packaged kirana staples and daily essentials straight to your doorstep.
                    </p>
                </section>

                {/* Story */}
                <section className="about-section">
                    <div className="about-card about-story">
                        <div className="about-card-icon">🏪</div>
                        <div>
                            <h2>Our Story</h2>
                            <p>
                                Sanjay Kirana Store has been serving the local community in
                                Harraiya, Basti with quality groceries at fair prices.
                                We believe every family deserves access to authentic, reliable
                                products without having to travel far. Our online store is
                                an extension of that promise — shop from home, get doorstep
                                delivery.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Values */}
                <section className="about-section">
                    <h2 className="about-section-title">Why Shop With Us?</h2>
                    <div className="about-values-grid">
                        {[
                            { icon: "✅", title: "Quality Products", desc: "Only trusted brands and quality-checked items on our shelves." },
                            { icon: "💰", title: "Best Prices", desc: "Competitive prices with regular discounts and deals." },
                            { icon: "🛵", title: "Fast Delivery", desc: "Quick home delivery within the local area." },
                            { icon: "📦", title: "Wide Selection", desc: "Over 100+ products across 12 categories." },
                            { icon: "🔒", title: "Safe Ordering", desc: "Secure checkout with Cash on Delivery option." },
                            { icon: "❤️", title: "Community First", desc: "Local store supporting the local community." },
                        ].map((v) => (
                            <div key={v.title} className="about-value-card">
                                <div className="about-value-icon">{v.icon}</div>
                                <h3>{v.title}</h3>
                                <p>{v.desc}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Categories */}
                <section className="about-section">
                    <h2 className="about-section-title">What We Stock</h2>
                    <div className="about-categories-list">
                        {CATEGORIES.map((cat) => (
                            <Link
                                key={cat.name}
                                to={`/products?category=${encodeURIComponent(cat.name)}`}
                                className="about-category-chip"
                            >
                                {cat.emoji} {cat.name}
                            </Link>
                        ))}
                    </div>
                </section>

                {/* How it works */}
                <section className="about-section">
                    <h2 className="about-section-title">How Ordering Works</h2>
                    <div className="about-steps">
                        {[
                            { step: "1", icon: "🔍", title: "Browse", desc: "Browse products by category or search by name." },
                            { step: "2", icon: "🛒", title: "Add to Cart", desc: "Add items to your cart, adjust quantities." },
                            { step: "3", icon: "📋", title: "Checkout", desc: "Enter your delivery address and choose payment." },
                            { step: "4", icon: "🛵", title: "Delivered", desc: "We deliver packaged kirana essentials to your door." },
                        ].map((s) => (
                            <div key={s.step} className="about-step">
                                <div className="about-step-number">{s.step}</div>
                                <div className="about-step-icon">{s.icon}</div>
                                <h3>{s.title}</h3>
                                <p>{s.desc}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* CTA */}
                <section className="about-cta">
                    <h2>Ready to Shop?</h2>
                    <p>Explore daily kirana essentials and get them delivered to your doorstep.</p>
                    <div className="about-cta-buttons">
                        <Link to="/products" className="about-cta-primary">
                            🛒 Shop Now
                        </Link>
                        <Link to="/categories" className="about-cta-secondary">
                            📦 Browse Categories
                        </Link>
                    </div>
                </section>

            </main>
            <Footer />
        </>
    );
}

export default About;
