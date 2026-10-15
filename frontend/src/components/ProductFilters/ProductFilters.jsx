import "./ProductFilters.css";
import { CATEGORY_NAMES } from "../../utils/categories";

function ProductFilters({
    selectedCategory,
    setSelectedCategory,
}) {
    return (
        <section className="product-filters">
            <div className="category-chips">
                {CATEGORY_NAMES.map((category) => (
                    <button
                        key={category}
                        className={
                            selectedCategory === category
                                ? "category-chip active"
                                : "category-chip"
                        }
                        onClick={() =>
                            setSelectedCategory(category)
                        }
                    >
                        {category}
                    </button>
                ))}
            </div>
        </section>
    );
}

export default ProductFilters;