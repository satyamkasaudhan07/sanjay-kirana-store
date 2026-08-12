import "./Categories.css";

import "./Categories.css";

import { FaCookieBite } from "react-icons/fa";
import { MdLocalDrink } from "react-icons/md";
import { GiWheat, GiMilkCarton, GiChiliPepper, GiBroom } from "react-icons/gi";
function Categories() {
    const categories = [
        { id: 1, icon: <GiWheat />, name: "Rice & Flour" },
        { id: 2, icon: <GiMilkCarton />, name: "Dairy" },
        { id: 3, icon: <MdLocalDrink />, name: "Beverages" },
        { id: 4, icon: <FaCookieBite />, name: "Snacks" },
        { id: 5, icon: <GiMilkCarton />, name: "Personal Care" },
        { id: 6, icon: <GiBroom />, name: "Household" },
        { id: 7, icon: <GiChiliPepper />, name: "Spices" },
        { id: 8, icon: <MdLocalDrink />, name: "Oil" },
    ];

    return (
        <section className="categories">
            <h2>Shop by Category</h2>

            <div className="category-grid">
                {categories.map((category) => (
                    <div key={category.id} className="category-card">
                        <div className="category-icon">{category.icon}</div>

                        <h3>{category.name}</h3>
                    </div>
                ))}
            </div>
        </section>
    );
}

export default Categories;