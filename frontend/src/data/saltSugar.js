import sugar from "../assets/products/salt-sugar/sugar.png";
import tataRockSalt from "../assets/products/salt-sugar/tata-rock-salt.png";
import tataSalt from "../assets/products/salt-sugar/tatasalt.png";

const saltSugar = [
  {
    id: 301,

    name: "Sugar",
    brand: "Loose",

    category: "Salt & Sugar",
    subCategory: "Sugar",

    size: "1kg",
    description: "",

    price: 48,
    originalPrice: 50,
    discount: 4,

    stock: 100,

    featured: true,
    bestseller: true,

    rating: 4.8,
    totalReviews: 260,

    image: sugar,
  },
  {
    id: 302,

    name: "Tata Salt",
    brand: "Tata",

    category: "Salt & Sugar",
    subCategory: "Salt",

    size: "1kg",
    description: "",

    price: 30,
    originalPrice: 32,
    discount: 6,

    stock: 80,

    featured: true,
    bestseller: true,

    rating: 4.9,
    totalReviews: 450,

    image: tataSalt,
  },
  {
    id: 303,

    name: "Tata Rock Salt",
    brand: "Tata",

    category: "Salt & Sugar",
    subCategory: "Rock Salt",

    size: "1kg",
    description: "",

    price: 65,
    originalPrice: 70,
    discount: 7,

    stock: 40,

    featured: false,
    bestseller: true,

    rating: 4.7,
    totalReviews: 180,

    image: tataRockSalt,
  },
];

export default saltSugar;