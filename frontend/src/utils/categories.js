/**
 * Master category list used by:
 *  - ProductFilters chip bar
 *  - Categories page cards
 *  - Any category-based filtering
 *
 * Matches exactly the categories stored in the PostgreSQL products table.
 */
export const CATEGORIES = [
    { name: "Personal Care",       emoji: "🧴" },
    { name: "Home Care",           emoji: "🏠" },
    { name: "Baby Care",           emoji: "👶" },
    { name: "Beverages",           emoji: "☕" },
    { name: "Biscuits & Snacks",   emoji: "🍪" },
    { name: "Dairy",               emoji: "🥛" },
    { name: "Instant Food",        emoji: "🍜" },
    { name: "Nutrition",           emoji: "💪" },
    { name: "Oil & Ghee",          emoji: "🫙" },
    { name: "Rice, Flour & Grains",emoji: "🌾" },
    { name: "Salt & Sugar",        emoji: "🧂" },
    { name: "Spices & Masalas",    emoji: "🌶️" },
];

/** Category names only, for filter chips (prefixed with "All") */
export const CATEGORY_NAMES = ["All", ...CATEGORIES.map((c) => c.name)];
