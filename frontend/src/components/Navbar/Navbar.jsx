import "./Navbar.css";
import { Link } from "react-router-dom";
import { GiShoppingBag } from "react-icons/gi";
import { FaShoppingCart, FaHeart } from "react-icons/fa";
function Navbar({ cart , wishlist }) {
  return (
    <nav className="navbar">
      <Link to="/" className="logo">
        <GiShoppingBag />
        <span>Sanjay Kirana</span>
      </Link>

      <ul className="nav-links">
        <li>
          <Link to="/">Home</Link>
        </li>

        <li>
          <a href="#categories">Categories</a>
        </li>

        <li>
          <Link to="/products">Products</Link>
        </li>

        <li>
          <Link to="/contact">Contact</Link>
        </li>
      </ul>
      <Link to="/wishlist" className="wishlist-nav-btn">
        <FaHeart />
        <span>Wishlist</span>

        {wishlist.length > 0 && (
          <div className="wishlist-count">
            {wishlist.length}
          </div>
        )}
      </Link>
      <Link to="/cart" className="cart-btn">
        <FaShoppingCart />
        <span>Cart</span>

        <div className="cart-count">
          {cart.length}
        </div>
      </Link>
    </nav>
  );
}

export default Navbar;