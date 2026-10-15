import { Link } from "react-router-dom";
import { GiShoppingBag } from "react-icons/gi";
import "./Footer.css";

function Footer() {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="site-footer">
            <div className="footer-container">
                {/* Column 1: Brand & Verified Location */}
                <div className="footer-col footer-brand-col">
                    <div className="footer-logo">
                        <GiShoppingBag />
                        <span>Sanjay Kirana Store</span>
                    </div>
                    <p className="footer-desc">
                        Your trusted neighbourhood grocery and daily-essentials store in Harraiya, Basti, Uttar Pradesh.
                        Delivering quality groceries straight to your doorstep.
                    </p>
                    <div className="footer-verified-badge">
                        <span className="badge-pin">📍</span>
                        <span>Harraiya, Basti, Uttar Pradesh — 272155</span>
                    </div>

                    <div className="footer-owner-card">
                        <span>Owner: <strong>Sanjay</strong></span>
                        <span className="owner-divider">·</span>
                        <a href="tel:+919919193538" className="footer-phone-btn" title="Call Store Owner">
                            📞 9919193538
                        </a>
                    </div>
                </div>

                {/* Column 2: Quick Links */}
                <div className="footer-col">
                    <h4>Quick Links</h4>
                    <ul className="footer-links">
                        <li><Link to="/">Home</Link></li>
                        <li><Link to="/categories">All Categories</Link></li>
                        <li><Link to="/products">Browse Products</Link></li>
                        <li><Link to="/orders">My Orders</Link></li>
                        <li><Link to="/cart">Shopping Cart</Link></li>
                    </ul>
                </div>

                {/* Column 3: Store Information */}
                <div className="footer-col">
                    <h4>About & Help</h4>
                    <ul className="footer-links">
                        <li><Link to="/about">About Our Store</Link></li>
                        <li><Link to="/contact">Contact & Inquiry</Link></li>
                        <li><Link to="/categories">Department Directory</Link></li>
                    </ul>
                </div>

                {/* Column 4: Delivery & Payment Guarantees */}
                <div className="footer-col footer-policy-col">
                    <h4>Delivery & Service Area</h4>
                    <div className="footer-delivery-notice">
                        <span className="notice-icon">🛵</span>
                        <p>
                            We deliver within a 2 km radius of Sanjay Kirana Store, Harraiya, Basti (PIN 272155). For assistance, call <a href="tel:+919919193538">9919193538</a>.
                        </p>
                    </div>
                    <div className="footer-policy-item">
                        <span className="policy-icon">🎉</span>
                        <div>
                            <strong>Free Delivery on ₹500+</strong>
                            <p>Standard delivery charge of ₹40 below ₹500</p>
                        </div>
                    </div>
                    <div className="footer-policy-item">
                        <span className="policy-icon">💵</span>
                        <div>
                            <strong>Cash on Delivery (COD) & UPI</strong>
                            <p>Pay securely upon delivery</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Bar */}
            <div className="footer-bottom">
                <div className="footer-bottom-container">
                    <p>© {currentYear} Sanjay Kirana Store. All rights reserved.</p>
                    <p className="footer-subtext">Harraiya, Basti · Quality Groceries at Fair Prices</p>
                </div>
            </div>
        </footer>
    );
}

export default Footer;

