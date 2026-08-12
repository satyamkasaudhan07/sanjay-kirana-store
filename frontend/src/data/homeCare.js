import comfort from "../assets/products/home-care/comfort.png";
import dettol from "../assets/products/home-care/dettol.png";
import dettolhandwash from "../assets/products/home-care/dettol-handwash.png";
import dettolAntisepticLiquid from "../assets/products/home-care/dettolAntisepticLiquid.png";
import dettolCool from "../assets/products/home-care/dettolcool.png";
import harpic from "../assets/products/home-care/harpic.png";
import lifebuoy from "../assets/products/home-care/lifebuoy.png";
import lizol from "../assets/products/home-care/lizol.png";
import surfExcel from "../assets/products/home-care/surfexcel.png";
import tide from "../assets/products/home-care/tide.png";
import vimBar from "../assets/products/home-care/vimbar.png";
import vimLiquid from "../assets/products/home-care/vimliquid.png";
import wheel from "../assets/products/home-care/wheel.png";

const homeCare = [
  {
    id: 101,

    name: "Dettol Soap",
    brand: "Dettol",

    category: "Home Care",
    subCategory: "Soap",

    size: "125g",
    description: "",

    price: 45,
    originalPrice: 45,
    discount: 0,

    stock: 60,

    featured: false,
    bestseller: false,

    rating: 4.6,
    totalReviews: 140,

    image: dettol,
  },
  {
    id: 102,

    name: "Dettol Antiseptic Liquid",
    brand: "Dettol",

    category: "Home Care",
    subCategory: "Antiseptic Liquid",

    size: "250ml",
    description: "",

    price: 135,
    originalPrice: 142,
    discount: 5,

    stock: 30,

    featured: false,
    bestseller: true,

    rating: 4.8,
    totalReviews: 90,

    image: dettolAntisepticLiquid,
  },
  {
    id: 103,

    name: "Dettol Cool Soap",
    brand: "Dettol",

    category: "Home Care",
    subCategory: "Soap",

    size: "125g",
    description: "",

    price: 48,
    originalPrice: 48,
    discount: 0,

    stock: 40,

    featured: false,
    bestseller: false,

    rating: 4.5,
    totalReviews: 100,

    image: dettolCool,
  },
  {
    id: 104,

    name: "Dettol Handwash",
    brand: "Dettol",

    category: "Home Care",
    subCategory: "Handwash",
    size: "200ml",
    description: "",
    price: 90,
    originalPrice: 95,
    discount: 5,
    stock: 50,
    featured: true,
    bestseller: true,
    rating: 4.7,
    totalReviews: 120,
    image: dettolhandwash,
  },
  {
    id: 113,

    name: "Harpic Toilet Cleaner",
    brand: "Harpic",

    category: "Home Care",
    subCategory: "Toilet Cleaner",

    size: "500ml",
    description: "",

    price: 110,
    originalPrice: 120,
    discount: 8,

    stock: 35,

    featured: true,
    bestseller: true,

    rating: 4.8,
    totalReviews: 220,

    image: harpic,
  },
  {
    id: 105,

    name: "Lifebuoy Soap",
    brand: "Lifebuoy",

    category: "Home Care",
    subCategory: "Soap",

    size: "125g",
    description: "",

    price: 42,
    originalPrice: 42,
    discount: 0,

    stock: 70,

    featured: false,
    bestseller: true,

    rating: 4.5,
    totalReviews: 170,

    image: lifebuoy,
  },
  {
    id: 106,

    name: "Lizol Floor Cleaner",
    brand: "Lizol",

    category: "Home Care",
    subCategory: "Floor Cleaner",

    size: "500ml",
    description: "",

    price: 165,
    originalPrice: 180,
    discount: 8,

    stock: 25,

    featured: true,
    bestseller: true,

    rating: 4.7,
    totalReviews: 160,

    image: lizol,
  },
  {
    id: 107,

    name: "Surf Excel Detergent Powder",
    brand: "Surf Excel",

    category: "Home Care",
    subCategory: "Detergent Powder",

    size: "1kg",
    description: "",

    price: 235,
    originalPrice: 250,
    discount: 6,

    stock: 30,

    featured: true,
    bestseller: true,

    rating: 4.8,
    totalReviews: 310,

    image: surfExcel,
  },
  {
    id: 108,

    name: "Vim Dishwash Bar",
    brand: "Vim",

    category: "Home Care",
    subCategory: "Dishwash Bar",

    size: "250g",
    description: "",

    price: 35,
    originalPrice: 38,
    discount: 8,

    stock: 60,

    featured: false,
    bestseller: true,

    rating: 4.6,
    totalReviews: 150,

    image: vimBar,
  },
  {
    id: 109,

    name: "Vim Dishwash Liquid",
    brand: "Vim",

    category: "Home Care",
    subCategory: "Dishwash Liquid",

    size: "500ml",
    description: "",

    price: 120,
    originalPrice: 130,
    discount: 8,

    stock: 40,

    featured: false,
    bestseller: false,

    rating: 4.7,
    totalReviews: 130,

    image: vimLiquid,
  },
  {
    id: 110,

    name: "Wheel Detergent Powder",
    brand: "Wheel",

    category: "Home Care",
    subCategory: "Detergent Powder",

    size: "1kg",
    description: "",

    price: 85,
    originalPrice: 90,
    discount: 6,

    stock: 45,

    featured: false,
    bestseller: true,

    rating: 4.4,
    totalReviews: 120,

    image: wheel,
  },
  {
    id: 111,

    name: "Tide Detergent Powder",
    brand: "Tide",
    category: "Home Care",
    subCategory: "Detergent Powder",
    size: "1kg",
    description: "",
    price: 250,
    originalPrice: 260,
    discount: 4,
    stock: 30,
    featured: true,
    bestseller: true,
    rating: 4.8,
    totalReviews: 310,
    image: tide,
  },
  {
    id: 112,
    name: "Comfort",
    brand: "Comfort",
    category: "Home Care",
    subCategory: "Fabric Conditioner",
    size: "430ml",
    description: "",
    price: 100,
    originalPrice: 125,
    discount: 20,
    stock: 30,
    featured: true,
    bestseller: true,
    rating: 4.8,
    totalReviews: 310,
    image: comfort,
  }
];

export default homeCare;