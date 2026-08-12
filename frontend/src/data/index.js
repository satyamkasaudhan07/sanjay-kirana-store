import personalCare from "./personalCare";
import homeCare from "./homeCare";
import babyCare from "./babyCare";
import Beverages from "./Beverages";
import biscuitsSnacks from "./biscuitsSnacks";
import Dairy from "./Dairy";
import instantFood from "./instantFood";
import Nutrition from "./Nutrition";
import oilGhee from "./oilGhee";
import riceFlour from "./riceFlourGrains";
import saltSugar from "./saltSugar";
import spicesMasalas from "./spicesMasalas";

const products = [
  ...personalCare,
  ...homeCare,
  ...babyCare,
  ...Beverages,
  ...biscuitsSnacks,
  ...Dairy,
  ...instantFood,
  ...Nutrition,
  ...oilGhee,
  ...riceFlour,
  ...saltSugar,
  ...spicesMasalas,
];

export default products;