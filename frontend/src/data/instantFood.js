import goldieOneOne from "../assets/products/instant-food/goldieoneone.png";
import lizzatPapad from "../assets/products/instant-food/lizzat.png";
import maggi from "../assets/products/instant-food/maggi.png";
import macaroni_pasta from "../assets/products/instant-food/nourish-macaroni-pasta.png";
import poha from "../assets/products/instant-food/nourish-poha.png";
const instantFood = [
  {
    id: 701,

    name: "Goldie 1-1 Noodles",
    brand: "Goldie",

    category: "Instant Food",
    subCategory: "Instant Noodles",

    size: "70g",
    description: "",

    price: 15,
    originalPrice: 15,
    discount: 0,

    stock: 60,

    featured: true,
    bestseller: false,

    rating: 4.3,
    totalReviews: 90,

    image: goldieOneOne,
  },
  {
    id: 702,

    name: "Maggi 2-Minute Noodles",
    brand: "Maggi",

    category: "Instant Food",
    subCategory: "Instant Noodles",

    size: "70g",
    description: "",

    price: 15,
    originalPrice: 15,
    discount: 0,

    stock: 100,

    featured: true,
    bestseller: true,

    rating: 4.9,
    totalReviews: 680,

    image: maggi,
  },
  {
    id: 703,

    name: "Nourish Macaroni Pasta",
    brand: "Nourish",

    category: "Instant Food",
    subCategory: "Pasta",

    size: "200g",
    description: "",

    price: 80,
    originalPrice: 90,
    discount: 11,

    stock: 40,

    featured: true,
    bestseller: true,

    rating: 4.6,
    totalReviews: 150,

    image: macaroni_pasta,
  },
  {
    id: 704,

    name: "Nourish Poha",
    brand: "Nourish",

    category: "Instant Food",
    subCategory: "Poha",

    size: "200g",
    description: "",

    price: 40,
    originalPrice: 45,
    discount: 11,

    stock: 50,

    featured: true,
    bestseller: true,

    rating: 4.5,
    totalReviews: 120,

    image: poha,
  }
];

export default instantFood;