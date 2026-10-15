import { Link } from "react-router-dom";
import Navbar from "../components/Navbar/Navbar";
import Footer from "../components/Footer/Footer";
import ProductCard from "../components/ProductCard/ProductCard";
import "./Wishlist.css";

function Wishlist({
    wishlist = [],
    setWishlist,
    cart = [],
    setCart,
}) {
    return (
        <>
            <Navbar cart={cart} wishlist={wishlist} />
            <main className="wishlist-page">
                <h1>My Wishlist ❤️</h1>

                {wishlist.length === 0 ? (
                    <div className="empty-wishlist">
                        <h2>Your wishlist is empty</h2>
                        <p>
                            Save products you love and find them here later.
                        </p>
                        <Link to="/products" className="continue-shopping">
                            Start Shopping
                        </Link>
                    </div>
                ) : (
                    <div className="wishlist-grid">
                        {wishlist.map((product) => (
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
                )}
            </main>
            <Footer />
        </>
    );
}

export default Wishlist;