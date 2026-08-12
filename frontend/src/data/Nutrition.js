import nutrela from "../assets/products/Nutrition/nutrela.png";
import nutrela10 from "../assets/products/Nutrition/nutrela10.png";
import nutrela10Green from "../assets/products/Nutrition/nutrela10green.png";
import nutrelaGreen from "../assets/products/Nutrition/nutrelagreen.png";

const Nutrition = [
  {
    id: 1101,

    name: "Nutrela Soya Chunks",
    brand: "Nutrela",

    category: "Nutrition",
    subCategory: "Soya Chunks",

    size: "200g",
    description: "",

    price: 70,
    originalPrice: 75,
    discount: 7,

    stock: 40,

    featured: true,
    bestseller: true,

    rating: 4.8,
    totalReviews: 240,

    image: nutrela,
  },
  {
    id: 1102,

    name: "Nutrela Soya Chunks",
    brand: "Nutrela",

    category: "Nutrition",
    subCategory: "Soya Chunks",

    size: "₹10 Pack",
    description: "",

    price: 10,
    originalPrice: 10,
    discount: 0,

    stock: 80,

    featured: false,
    bestseller: true,

    rating: 4.6,
    totalReviews: 95,

    image: nutrela10,
  },
  {
    id: 1103,

    name: "Nutrela Mini Soya Chunks",
    brand: "Nutrela",

    category: "Nutrition",
    subCategory: "Soya Chunks",

    size: "₹10 Pack",
    description: "",

    price: 10,
    originalPrice: 10,
    discount: 0,

    stock: 80,

    featured: false,
    bestseller: false,

    rating: 4.6,
    totalReviews: 85,

    image: nutrela10Green,
  },
  {
    id: 1104,

    name: "Nutrela Mini Soya Chunks",
    brand: "Nutrela",

    category: "Nutrition",
    subCategory: "Soya Chunks",

    size: "200g",
    description: "",

    price: 75,
    originalPrice: 80,
    discount: 6,

    stock: 35,

    featured: true,
    bestseller: false,

    rating: 4.7,
    totalReviews: 170,

    image: nutrelaGreen,
  },
];

export default Nutrition;