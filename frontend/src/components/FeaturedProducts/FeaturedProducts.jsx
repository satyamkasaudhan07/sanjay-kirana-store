import "./FeaturedProducts.css";
import ProductCard from "../ProductCard/ProductCard";
import axios from "axios";
import { useEffect, useState } from "react";

function FeaturedProducts({
    cart,
    setCart,
    wishlist,
    setWishlist,
    search,
}) {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Get products from Flask API
    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const response = await axios.get(
                    "http://127.0.0.1:5000/products"
                );

                setProducts(response.data);
            } catch (err) {
                console.error("Error fetching products:", err);
                setError("Failed to load products.");
            } finally {
                setLoading(false);
            }
        };

        fetchProducts();
    }, []);

    const searchText = search.trim().toLowerCase();

    const featuredProducts = products.filter((product) => {
        const matchesSearch =
            !searchText ||
            product.name?.toLowerCase().includes(searchText) ||
            product.brand?.toLowerCase().includes(searchText) ||
            product.category?.toLowerCase().includes(searchText) ||
            product.subCategory?.toLowerCase().includes(searchText);

        return product.featured && matchesSearch;
    });

    // Loading
    if (loading) {
        return (
            <section
                id="products"
                className="featured-products"
            >
                <h2>Featured Products</h2>
                <p>Loading products...</p>
            </section>
        );
    }

    // Error
    if (error) {
        return (
            <section
                id="products"
                className="featured-products"
            >
                <h2>Featured Products</h2>
                <p>{error}</p>
            </section>
        );
    }

    return (
        <section
            id="products"
            className="featured-products"
        >
            <h2>
                {search
                    ? `Search Results for "${search}"`
                    : "Featured Products"}
            </h2>

            <div className="products-grid">
                {featuredProducts.length > 0 ? (
                    featuredProducts.map((product) => (
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
                            Try another product name or brand.
                        </p>
                    </div>
                )}
            </div>
        </section>
    );
}

export default FeaturedProducts;