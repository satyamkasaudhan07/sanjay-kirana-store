import johnsonsBabyOil from "../assets/products/baby-care/Johnsonsbabyoil.png";
import johnsonsBabyPowder from "../assets/products/baby-care/johnsonsbabypowder.png";
import johnsonsBabySoap from "../assets/products/baby-care/Johnsonsbabysoap.png";
import nestogen from "../assets/products/baby-care/NEstogen.png";
import nestogen1 from "../assets/products/baby-care/nestogen1.png";
import pampers from "../assets/products/baby-care/pampers-20.png";

const babyCare = [
  {
    id: 1001,

    name: "Johnson's Baby Oil",
    brand: "Johnson's",

    category: "Baby Care",
    subCategory: "Baby Oil",

    size: "200ml",
    description: "",

    price: 185,
    originalPrice: 200,
    discount: 8,

    stock: 30,

    featured: true,
    bestseller: true,

    rating: 4.8,
    totalReviews: 320,

    image: johnsonsBabyOil,
  },
  {
    id: 1002,

    name: "Johnson's Baby Powder",
    brand: "Johnson's",

    category: "Baby Care",
    subCategory: "Baby Powder",

    size: "200g",
    description: "",

    price: 160,
    originalPrice: 170,
    discount: 6,

    stock: 35,

    featured: true,
    bestseller: true,

    rating: 4.8,
    totalReviews: 280,

    image: johnsonsBabyPowder,
  },
  {
    id: 1003,

    name: "Johnson's Baby Soap",
    brand: "Johnson's",

    category: "Baby Care",
    subCategory: "Baby Soap",

    size: "125g",
    description: "",

    price: 75,
    originalPrice: 80,
    discount: 6,

    stock: 40,

    featured: false,
    bestseller: true,

    rating: 4.7,
    totalReviews: 210,

    image: johnsonsBabySoap,
  },
  {
    id: 1004,

    name: "Nestogen Stage 1",
    brand: "Nestogen",

    category: "Baby Care",
    subCategory: "Infant Formula",

    size: "400g",
    description: "",

    price: 420,
    originalPrice: 450,
    discount: 7,

    stock: 20,

    featured: true,
    bestseller: false,

    rating: 4.7,
    totalReviews: 95,

    image: nestogen1,
  },
  {
    id: 1005,

    name: "Nestogen Stage 2",
    brand: "Nestogen",

    category: "Baby Care",
    subCategory: "Infant Formula",

    size: "400g",
    description: "",

    price: 440,
    originalPrice: 470,
    discount: 6,

    stock: 18,

    featured: false,
    bestseller: false,

    rating: 4.7,
    totalReviews: 82,

    image: nestogen,
  },
  {
    id: 1006,

    name: "Pampers Diapers",
    brand: "Pampers",

    category: "Baby Care",
    subCategory: "Diapers",

    size: "56 Pieces",
    description: "",

    price: 320,
    originalPrice: 350,
    discount: 9,

    stock: 25,

    featured: true,
    bestseller: true,

    rating: 4.8,
    totalReviews: 290,

    image: pampers,
  }
];

export default babyCare;