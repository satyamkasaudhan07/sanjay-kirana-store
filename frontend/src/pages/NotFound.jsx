import { Link } from "react-router-dom";
import Navbar from "../components/Navbar/Navbar";
import Footer from "../components/Footer/Footer";
import "./NotFound.css";

function NotFound({ cart, wishlist }) {
    return (
        <>
            <Navbar cart={cart || []} wishlist={wishlist || []} />

            <main className="notfound-page">
                <div className="notfound-card">
                    <div className="notfound-emoji">🛒</div>
                    <h1>404</h1>
                    <h2>Page Not Found</h2>
                    <p>
                        Oops! The page you're looking for doesn't exist or
                        may have been moved.
                    </p>
                    <div className="notfound-actions">
                        <Link to="/" className="notfound-primary">
                            🏠 Go to Home
                        </Link>
                        <Link to="/products" className="notfound-secondary">
                            🛍️ Browse Products
                        </Link>
                    </div>
                </div>
            </main>
            <Footer />
        </>
    );
}

export default NotFound;
