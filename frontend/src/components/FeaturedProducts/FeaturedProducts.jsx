import "./FeaturedProducts.css";
import ProductCard from "../ProductCard/ProductCard";
import { useEffect, useState } from "react";
import api, { getApiErrorMessage } from "../../utils/api";

function FeaturedProducts({
    cart,
    setCart,
    wishlist,
    setWishlist,
    search,
    selectedCategory = "All",
}) {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Get products from Flask API
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

    const searchText = (search || "").trim().toLowerCase();

    const displayedProducts = products.filter((product) => {
        const matchesSearch =
            !searchText ||
            product.name?.toLowerCase().includes(searchText) ||
            product.brand?.toLowerCase().includes(searchText) ||
            product.category?.toLowerCase().includes(searchText) ||
            product.subCategory?.toLowerCase().includes(searchText);

        const matchesCategory =
            !selectedCategory ||
            selectedCategory === "All" ||
            product.category === selectedCategory;

        // If search or specific category is selected, show all matching products;
        // otherwise default to featured/bestseller items
        const matchesFeatured =
            searchText || selectedCategory !== "All"
                ? true
                : product.featured || product.bestseller;

        return matchesSearch && matchesCategory && matchesFeatured;
    });

    return (
        <section id="products" className="featured-products">
            <div className="featured-products-header">
                <h2>
                    {searchText
                        ? `Search Results for "${search}"`
                        : selectedCategory !== "All"
                        ? `${selectedCategory} Products`
                        : "Featured Essentials & Bestsellers"}
                </h2>
                <p className="featured-subtitle">
                    {searchText
                        ? "Showing products matching your search criteria"
                        : selectedCategory !== "All"
                        ? `Browse popular products in ${selectedCategory}`
                        : "Handpicked daily grocery staples, snacks, and household essentials"}
                </p>
            </div>

            {loading && (
                <div className="no-products">
                    <h2>Loading products...</h2>
                    <p>Fetching the latest stock from Sanjay Kirana Store.</p>
                </div>
            )}

            {!loading && error && (
                <div className="no-products">
                    <h2>Could not load products</h2>
                    <p>{error}</p>
                </div>
            )}

            {!loading && !error && (
                <div className="products-grid">
                    {displayedProducts.length > 0 ? (
                        displayedProducts.map((product) => (
                            <ProductCard
                                key={product.id}
                                product={product}
                                cart={cart}
                                setCart={setCart}
                                wishlist={wishlist}
                                setWishlist={setWishlist}
                            />
                        ))
                    ) : (
                        <div className="no-products">
                            <h2>😕 No products found</h2>
                            <p>
                                {searchText
                                    ? `No items found matching "${search}". Try searching for another keyword or brand.`
                                    : "No products currently available in this category."}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}

export default FeaturedProducts;