import bailKolhu1L from "../assets/products/oil-ghee/bailkohlu1L.png";
import bailKolhu2L from "../assets/products/oil-ghee/bailkohlu2L.png";
import bailKolhu5L from "../assets/products/oil-ghee/bailkohlu5L.png";
import fortune from "../assets/products/oil-ghee/fortune.png";
import fortuneSarso from "../assets/products/oil-ghee/fortunesarso.png";

const oilGhee = [
  {
    id: 401,

    name: "Bail Kolhu Mustard Oil",
    brand: "Bail Kolhu",

    category: "Oil & Ghee",
    subCategory: "Mustard Oil",

    size: "1L",
    description: "",

    price: 190,
    originalPrice: 200,
    discount: 5,

    stock: 30,

    featured: true,
    bestseller: true,

    rating: 4.8,
    totalReviews: 180,

    image: bailKolhu1L,
  },
  {
    id: 402,

    name: "Bail Kolhu Mustard Oil",
    brand: "Bail Kolhu",

    category: "Oil & Ghee",
    subCategory: "Mustard Oil",

    size: "2L",
    description: "",

    price: 380,
    originalPrice: 400,
    discount: 5,

    stock: 20,

    featured: false,
    bestseller: true,

    rating: 4.8,
    totalReviews: 120,

    image: bailKolhu2L,
  },
  {
    id: 403,

    name: "Bail Kolhu Mustard Oil",
    brand: "Bail Kolhu",

    category: "Oil & Ghee",
    subCategory: "Mustard Oil",

    size: "5L",
    description: "",

    price: 920,
    originalPrice: 960,
    discount: 4,

    stock: 12,

    featured: true,
    bestseller: true,

    rating: 4.9,
    totalReviews: 95,

    image: bailKolhu5L,
  },
  {
    id: 404,

    name: "Fortune Refined Oil",
    brand: "Fortune",

    category: "Oil & Ghee",
    subCategory: "Refined Oil",

    size: "1L",
    description: "",

    price: 175,
    originalPrice: 185,
    discount: 5,

    stock: 35,

    featured: true,
    bestseller: true,

    rating: 4.7,
    totalReviews: 240,

    image: fortune,
  },
  {
    id: 405,

    name: "Fortune Kachi Ghani Mustard Oil",
    brand: "Fortune",

    category: "Oil & Ghee",
    subCategory: "Mustard Oil",

    size: "1L",
    description: "",

    price: 195,
    originalPrice: 205,
    discount: 5,

    stock: 28,

    featured: false,
    bestseller: true,

    rating: 4.8,
    totalReviews: 170,

    image: fortuneSarso,
  },
];

export default oilGhee;