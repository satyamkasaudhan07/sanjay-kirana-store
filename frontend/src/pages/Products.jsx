import Navbar from "../components/Navbar/Navbar";
import Footer from "../components/Footer/Footer";
import ProductFilters from "../components/ProductFilters/ProductFilters";
import ProductCard from "../components/ProductCard/ProductCard";
import "./Products.css";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import api, { getApiErrorMessage } from "../utils/api";

function Products({
    cart,
    setCart,
    wishlist,
    setWishlist,
}) {
    const location = useLocation();
    const [products, setProducts] = useState([]);

    const [search, setSearch] = useState("");
    const [selectedCategory, setSelectedCategory] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get("category") || "All";
    });
    const [sortBy, setSortBy] = useState("default");

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Sync category when URL query parameter changes
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const cat = params.get("category");
        if (cat) {
            setSelectedCategory(cat);
        } else {
            setSelectedCategory("All");
        }
    }, [location.search]);

    // Fetch products from Flask
    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const response = await api.get("/products");
                setProducts(response.data);
            } catch (err) {
                console.error("Error fetching products:", err);
                setError(getApiErrorMessage(err, "Failed to load products."));
            } finally {
                setLoading(false);
            }
        };

        fetchProducts();
    }, []);

    const searchText = search.trim().toLowerCase();

    const filteredProducts = products
        .filter((product) => {
            const matchesSearch =
                !searchText ||
                product.name?.toLowerCase().includes(searchText) ||
                product.brand?.toLowerCase().includes(searchText) ||
                product.category?.toLowerCase().includes(searchText) ||
                product.subCategory?.toLowerCase().includes(searchText);

            const matchesCategory =
                selectedCategory === "All" ||
                product.category === selectedCategory;

            return matchesSearch && matchesCategory;
        })
        .sort((a, b) => {
            if (sortBy === "price-low") {
                return a.price - b.price;
            }

            if (sortBy === "price-high") {
                return b.price - a.price;
            }

            if (sortBy === "rating") {
                return b.rating - a.rating;
            }

            if (sortBy === "discount") {
                return b.discount - a.discount;
            }

            return 0;
        });

    
    return (
        <>
            <Navbar
                cart={cart}
                wishlist={wishlist}
            />

            <main className="products-page">
                <div className="products-page-header">
                    <h1>All Products</h1>

                    <p>
                        Browse everything available at Sanjay Kirana
                    </p>
                </div>

                {/* Search */}

                <div className="products-search">
                    <input
                        type="text"
                        placeholder="Search products, brands..."
                        value={search}
                        onChange={(e) =>
                            setSearch(e.target.value)
                        }
                    />

                    {search && (
                        <button
                            onClick={() => setSearch("")}
                        >
                            ✕
                        </button>
                    )}
                </div>

                {/* Categories */}

                <ProductFilters
                    selectedCategory={selectedCategory}
                    setSelectedCategory={setSelectedCategory}
                />

                <div className="products-toolbar">

                    <div className="products-result-header">

                        <h2>
                            {selectedCategory === "All"
                                ? "All Products"
                                : selectedCategory}
                        </h2>

                        <span>
                            {filteredProducts.length} products
                        </span>

                    </div>

                    <select
                        value={sortBy}
                        onChange={(e) =>
                            setSortBy(e.target.value)
                        }
                        className="sort-select"
                    >
                        <option value="default">
                            Sort By
                        </option>

                        <option value="price-low">
                            Price: Low to High
                        </option>

                        <option value="price-high">
                            Price: High to Low
                        </option>

                        <option value="rating">
                            Rating
                        </option>

                        <option value="discount">
                            Discount
                        </option>
                    </select>

                </div>

                {/* Loading */}

                {loading && (
                    <div className="products-empty">
                        <h2>Loading products...</h2>
                    </div>
                )}

                {/* Error */}

                {!loading && error && (
                    <div className="products-empty">
                        <h2>😕 {error}</h2>

                        <p>
                            Make sure the Flask server is running.
                        </p>
                    </div>
                )}

                {/* Results */}

                {!loading && !error && (

                    <>

                        {filteredProducts.length > 0 ? (

                            <div className="all-products-grid">

                                {filteredProducts.map((product) => (

                                    <ProductCard
                                        key={product.id}
                                        product={product}
                                        cart={cart}
                                        setCart={setCart}
                                        wishlist={wishlist}
                                        setWishlist={setWishlist}
                                    />

                                ))}

                            </div>

                        ) : (

                            <div className="products-empty">

                                <div>
                                    😕
                                </div>

                                <h2>
                                    No products found
                                </h2>

                                <p>
                                    Try a different product name,
                                    brand, or category.
                                </p>

                                <button
                                    onClick={() => {
                                        setSearch("");
                                        setSelectedCategory("All");
                                    }}
                                >
                                    Clear Filters
                                </button>

                            </div>

                        )}

                    </>
                )}

            </main>
            <Footer />
        </>
    );
}

export default Products;