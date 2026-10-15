import Navbar from "../components/Navbar/Navbar";
import Hero from "../components/Hero/Hero";
import Categories from "../components/Categories/Categories";
import ProductFilters from "../components/ProductFilters/ProductFilters";
import FeaturedProducts from "../components/FeaturedProducts/FeaturedProducts";
import Footer from "../components/Footer/Footer";
import { useState } from "react";

function Home({
    cart,
    setCart,
    wishlist,
    setWishlist,
}) {
    const [search, setSearch] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("All");

    return (
        <>
            <Navbar cart={cart} wishlist={wishlist} />

            <main>
                <Hero search={search} setSearch={setSearch} />

                <Categories />

                <ProductFilters
                    selectedCategory={selectedCategory}
                    setSelectedCategory={setSelectedCategory}
                />

                <FeaturedProducts
                    cart={cart}
                    setCart={setCart}
                    search={search}
                    selectedCategory={selectedCategory}
                    wishlist={wishlist}
                    setWishlist={setWishlist}
                />
            </main>

            <Footer />
        </>
    );
}

export default Home;