import nescafe from "../assets/products/Beverages/nescafe.png";
import nescafeJar from "../assets/products/Beverages/nescafejar.png";
import taazaTea from "../assets/products/Beverages/taazatea.png";
import tataAgni from "../assets/products/Beverages/tataagni.png";
import tataTea from "../assets/products/Beverages/tatatea.png";

const Beverages = [
  {
    id: 901,

    name: "Nescafe Classic",
    brand: "Nescafe",

    category: "Beverages",
    subCategory: "Coffee",

    size: "50g",
    description: "",

    price: 175,
    originalPrice: 190,
    discount: 8,

    stock: 30,

    featured: true,
    bestseller: true,

    rating: 4.8,
    totalReviews: 320,

    image: nescafe,
  },
  {
    id: 902,

    name: "Nescafe Classic Jar",
    brand: "Nescafe",

    category: "Beverages",
    subCategory: "Coffee",

    size: "100g",
    description: "",

    price: 350,
    originalPrice: 380,
    discount: 8,

    stock: 20,

    featured: true,
    bestseller: true,

    rating: 4.8,
    totalReviews: 240,

    image: nescafeJar,
  },
  {
    id: 903,

    name: "Taaza Tea",
    brand: "Taaza",

    category: "Beverages",
    subCategory: "Tea",

    size: "250g",
    description: "",

    price: 150,
    originalPrice: 160,
    discount: 6,

    stock: 40,

    featured: false,
    bestseller: true,

    rating: 4.6,
    totalReviews: 180,

    image: taazaTea,
  },
  {
    id: 904,

    name: "Tata Agni Tea",
    brand: "Tata",

    category: "Beverages",
    subCategory: "Tea",

    size: "250g",
    description: "",

    price: 170,
    originalPrice: 180,
    discount: 6,

    stock: 35,

    featured: true,
    bestseller: true,

    rating: 4.7,
    totalReviews: 210,

    image: tataAgni,
  },
  {
    id: 905,

    name: "Tata Tea Gold",
    brand: "Tata",

    category: "Beverages",
    subCategory: "Tea",

    size: "250g",
    description: "",

    price: 190,
    originalPrice: 205,
    discount: 7,

    stock: 30,

    featured: true,
    bestseller: true,

    rating: 4.8,
    totalReviews: 260,

    image: tataTea,
  },
];

export default Beverages;