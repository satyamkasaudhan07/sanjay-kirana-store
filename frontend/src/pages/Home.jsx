import Navbar from "../components/Navbar/Navbar";
import Hero from "../components/Hero/Hero";
import ProductFilters from "../components/ProductFilters/ProductFilters";
import FeaturedProducts from "../components/FeaturedProducts/FeaturedProducts";
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
            <Navbar cart={cart} 
                wishlist={wishlist}
            />

            <Hero
                search={search}
                setSearch={setSearch}
            />

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
        </>
    );
}

export default Home;