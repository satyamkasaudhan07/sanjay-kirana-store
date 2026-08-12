import Navbar from "../components/Navbar/Navbar";
import ProductFilters from "../components/ProductFilters/ProductFilters";
import ProductCard from "../components/ProductCard/ProductCard";
import products from "../data";
import "./Products.css";
import { useState } from "react";

function Products({
    cart,
    setCart,
    wishlist,
    setWishlist,
}) {
    const [search, setSearch] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("All");
    const [sortBy, setSortBy] = useState("default");
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
                        onChange={(e) => setSortBy(e.target.value)}
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
                {/* Results */}

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

            </main>
        </>
    );
}

export default Products;