import "./FeaturedProducts.css";
import ProductCard from "../ProductCard/ProductCard";
import products from "../../data";

function FeaturedProducts({
    cart,
    setCart,
    search,
    selectedCategory,
    wishlist,
    setWishlist,
}) {
    const searchText = search.trim().toLowerCase();

    const displayedProducts = products.filter((product) => {

        const matchesSearch =
            !searchText ||
            product.name?.toLowerCase().includes(searchText) ||
            product.brand?.toLowerCase().includes(searchText) ||
            product.category?.toLowerCase().includes(searchText) ||
            product.subCategory?.toLowerCase().includes(searchText);

        const matchesCategory =
            selectedCategory === "All" ||
            product.category === selectedCategory;

        // Default homepage
        // Show only featured products
        if (!searchText && selectedCategory === "All") {
            return product.featured;
        }

        // Search + category filter
        return matchesSearch && matchesCategory;
    });

    return (
        <section
            id="products"
            className="featured-products"
        >
            <h2>
                {searchText
                    ? `Search Results for "${search}"`
                    : selectedCategory === "All"
                        ? "Featured Products"
                        : selectedCategory}
            </h2>

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
                            Try another product, brand,
                            or category.
                        </p>
                    </div>

                )}

            </div>
        </section>
    );
}

export default FeaturedProducts;