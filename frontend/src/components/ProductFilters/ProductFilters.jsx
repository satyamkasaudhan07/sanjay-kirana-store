import "./ProductFilters.css";

const categories = [
    "All",
    "Personal Care",
    "Home Care",
    "Baby Care",
    "Beverages",
    "Biscuits & Snacks",
    "Dairy",
    "Instant Food",
    "Nutrition",
    "Oil & Ghee",
    "Rice, Flour & Grains",
    "Salt & Sugar",
    "Spices & Masalas",
];

function ProductFilters({
    selectedCategory,
    setSelectedCategory,
}) {
    return (
        <section className="product-filters">

            <div className="category-chips">

                {categories.map((category) => (
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