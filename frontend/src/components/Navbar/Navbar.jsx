import "./Navbar.css";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { GiShoppingBag } from "react-icons/gi";
import { FaShoppingCart, FaHeart, FaUser, FaSignOutAlt, FaShieldAlt, FaCrown } from "react-icons/fa";
import { useState, useEffect } from "react";
import { getUser, isAuthenticated, logout } from "../../utils/auth";

function Navbar({ cart = [], wishlist = [] }) {
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    const [user, setUser] = useState(() => getUser());

    // Listen for auth changes across app and storage
    useEffect(() => {
        const syncAuth = () => {
            setUser(getUser());
        };
        window.addEventListener("sk_auth_changed", syncAuth);
        window.addEventListener("storage", syncAuth);
        return () => {
            window.removeEventListener("sk_auth_changed", syncAuth);
            window.removeEventListener("storage", syncAuth);
        };
    }, []);

    const closeMenu = () => setMenuOpen(false);

    const handleLogout = () => {
        logout();
        setUser(null);
        closeMenu();
        navigate("/");
    };

    const isUserOwner = user?.role === "owner";
    const isUserAdmin = user?.role === "admin";
    const isUserCustomer = user?.role === "customer";

    return (
        <nav className="navbar">
            {/* Logo */}
            <Link to="/" className="logo" onClick={closeMenu}>
                <GiShoppingBag />
                <span>Sanjay Kirana</span>
            </Link>

            {/* Nav links */}
            <ul className={`nav-links${menuOpen ? " open" : ""}`}>
                <li>
                    <NavLink to="/" end onClick={closeMenu}>
                        Home
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/categories" onClick={closeMenu}>
                        Categories
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/products" onClick={closeMenu}>
                        Products
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/orders" onClick={closeMenu}>
                        Orders
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/contact" onClick={closeMenu}>
                        Contact
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/about" onClick={closeMenu}>
                        About
                    </NavLink>
                </li>

                {/* Mobile-only auth action */}
                <li className="mobile-auth-link">
                    {isAuthenticated() ? (
                        <div className="mobile-auth-wrapper">
                            <span className="mobile-user-info">
                                {isUserOwner ? "👑 Owner (Sanjay)" : isUserAdmin ? "🛡️ Admin" : `👤 ${user?.name || user?.phone || "Customer"}`}
                            </span>
                            {isUserOwner ? (
                                <Link to="/owner/dashboard" onClick={closeMenu} className="mobile-admin-dash-btn" style={{ background: "#92400e" }}>
                                    👑 Owner Dashboard →
                                </Link>
                            ) : isUserAdmin ? (
                                <Link to="/admin/dashboard" onClick={closeMenu} className="mobile-admin-dash-btn">
                                    🛡️ Admin Dashboard →
                                </Link>
                            ) : (
                                <Link to="/account" onClick={closeMenu} className="mobile-admin-dash-btn" style={{ background: "#176534" }}>
                                    My Account →
                                </Link>
                            )}
                            <button onClick={handleLogout} className="mobile-logout-btn">
                                Sign Out
                            </button>
                        </div>
                    ) : (
                        <NavLink to="/login" onClick={closeMenu} className="mobile-login-link">
                            Sign In / Register
                        </NavLink>
                    )}
                </li>
            </ul>

            {/* Icon buttons & Hamburger */}
            <div className="nav-icon-group">
                <Link to="/wishlist" className="wishlist-nav-btn" onClick={closeMenu}>
                    <FaHeart />
                    <span className="nav-label">Wishlist</span>
                    {wishlist.length > 0 && (
                        <div className="wishlist-count">{wishlist.length}</div>
                    )}
                </Link>

                <Link to="/cart" className="cart-btn" onClick={closeMenu}>
                    <FaShoppingCart />
                    <span className="nav-label">Cart</span>
                    <div className="cart-count">{cart.length}</div>
                </Link>

                {/* Desktop Auth Button */}
                {isAuthenticated() ? (
                    <div className="nav-user-menu">
                        {isUserOwner ? (
                            <Link to="/owner/dashboard" className="admin-pill-btn" onClick={closeMenu} title="Open Owner Governance Portal" style={{ background: "#92400e" }}>
                                <FaCrown />
                                <span className="nav-label">Owner</span>
                            </Link>
                        ) : isUserAdmin ? (
                            <Link to="/admin/dashboard" className="admin-pill-btn" onClick={closeMenu} title="Open Admin Portal">
                                <FaShieldAlt />
                                <span className="nav-label">Admin</span>
                            </Link>
                        ) : (
                            <Link to="/account" className="user-profile-btn" onClick={closeMenu} title="My Account Dashboard">
                                <FaUser />
                                <span className="nav-label user-truncate">
                                    {user?.name || user?.phone || "Account"}
                                </span>
                            </Link>
                        )}
                        <button onClick={handleLogout} className="nav-logout-icon-btn" title="Sign Out">
                            <FaSignOutAlt />
                        </button>
                    </div>
                ) : (
                    <Link to="/login" className="login-nav-btn" onClick={closeMenu}>
                        <FaUser />
                        <span className="nav-label">Sign In</span>
                    </Link>
                )}

                {/* Hamburger toggle (mobile only) */}
                <button
                    className="nav-hamburger"
                    onClick={() => setMenuOpen((o) => !o)}
                    aria-label="Toggle navigation menu"
                >
                    {menuOpen ? "✕" : "☰"}
                </button>
            </div>
        </nav>
    );
}

export default Navbar;