import "./Categories.css";
import { Link, useNavigate } from "react-router-dom";
import { CATEGORIES } from "../../utils/categories";

function Categories() {
    const navigate = useNavigate();

    const handleCategoryClick = (categoryName) => {
        navigate(`/products?category=${encodeURIComponent(categoryName)}`);
    };

    return (
        <section className="featured-categories-section">
            <div className="categories-header-row">
                <div>
                    <h2>Shop by Department</h2>
                    <p className="categories-subtitle">Browse everyday groceries and essentials by category</p>
                </div>
                <Link to="/categories" className="view-all-categories-link">
                    View All 12 Categories →
                </Link>
            </div>

            <div className="featured-category-grid">
                {CATEGORIES.map((category) => (
                    <div
                        key={category.name}
                        className="featured-category-card"
                        onClick={() => handleCategoryClick(category.name)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                handleCategoryClick(category.name);
                            }
                        }}
                    >
                        <span className="category-emoji">{category.emoji}</span>
                        <h3>{category.name}</h3>
                    </div>
                ))}
            </div>
        </section>
    );
}

export default Categories;