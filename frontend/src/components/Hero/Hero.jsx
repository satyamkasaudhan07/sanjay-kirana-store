import "./Hero.css";

function Hero({ search, setSearch }) {
    return (
        <section className="hero">

            <div className="hero-content">

                <span className="hero-tag">
                    🥬 Fresh & Healthy Groceries
                </span>

                <h1>
                    Fresh Groceries
                    <span>Delivered to Your Doorstep</span>
                </h1>

                <p>
                    Shop from a wide range of groceries including
                    vegetables, fruits, dairy, snacks and household
                    essentials at the best prices.
                </p>

                {/* Search */}
                <div className="hero-search">
                    <span className="search-icon">🔍</span>

                    <input
                        type="text"
                        placeholder="Search products, brands and more..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />

                    {search && (
                        <button
                            className="clear-search"
                            onClick={() => setSearch("")}
                        >
                            ✕
                        </button>
                    )}
                </div>

                <div className="hero-buttons">

                    <button
                        className="primary-btn"
                        onClick={() =>
                            document
                                .getElementById("products")
                                ?.scrollIntoView({
                                    behavior: "smooth"
                                })
                        }
                    >
                        🛒 Shop Now
                    </button>

                    <button
                        className="secondary-btn"
                        onClick={() =>
                            document
                                .getElementById("products")
                                ?.scrollIntoView({
                                    behavior: "smooth"
                                })
                        }
                    >
                        📦 Browse Products
                    </button>

                </div>

            </div>

            <div className="hero-image">

                <img
                    src="/hero.png"
                    alt="Fresh groceries"
                />

            </div>

        </section>
    );
}

export default Hero;