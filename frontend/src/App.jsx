import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";

import Home from "./pages/Home";
import Cart from "./pages/Cart";
import Wishlist from "./pages/Wishlist";
import ProductDetails from "./pages/ProductDetails";
import Checkout from "./pages/Checkout";
import OrderConfirmation from "./pages/OrderConfirmation";
import Products from "./pages/Products";
import Orders from "./pages/Orders";
import TrackOrder from "./pages/TrackOrder";
import CategoriesPage from "./pages/CategoriesPage";
import Contact from "./pages/Contact";
import About from "./pages/About";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Account from "./pages/Account";
import CompleteProfile from "./pages/CompleteProfile";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import OwnerLogin from "./pages/OwnerLogin";
import OwnerDashboard from "./pages/OwnerDashboard";
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  // Load cart from localStorage
  const [cart, setCart] = useState(() => {
    const savedCart = localStorage.getItem("cart");
    return savedCart ? JSON.parse(savedCart) : [];
  });

  // Load wishlist from localStorage
  const [wishlist, setWishlist] = useState(() => {
    const savedWishlist = localStorage.getItem("wishlist");
    return savedWishlist ? JSON.parse(savedWishlist) : [];
  });
  // Save cart whenever it changes
  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(cart));
  }, [cart]);

  // Save wishlist whenever it changes
  useEffect(() => {
    localStorage.setItem("wishlist", JSON.stringify(wishlist));
  }, [wishlist]);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <Home
              cart={cart}
              setCart={setCart}
              wishlist={wishlist}
              setWishlist={setWishlist}
            />
          }
        />

        <Route
          path="/categories"
          element={
            <CategoriesPage
              cart={cart}
              setCart={setCart}
              wishlist={wishlist}
              setWishlist={setWishlist}
            />
          }
        />

        <Route
          path="/products"
          element={
            <Products
              cart={cart}
              setCart={setCart}
              wishlist={wishlist}
              setWishlist={setWishlist}
            />
          }
        />

        {/* Supports both /product/:id and /products/:id */}
        <Route
          path="/product/:id"
          element={
            <ProductDetails
              cart={cart}
              setCart={setCart}
              wishlist={wishlist}
              setWishlist={setWishlist}
            />
          }
        />
        <Route
          path="/products/:id"
          element={
            <ProductDetails
              cart={cart}
              setCart={setCart}
              wishlist={wishlist}
              setWishlist={setWishlist}
            />
          }
        />

        <Route
          path="/cart"
          element={
            <Cart
              cart={cart}
              setCart={setCart}
              wishlist={wishlist}
            />
          }
        />

        <Route
          path="/wishlist"
          element={
            <Wishlist
              wishlist={wishlist}
              setWishlist={setWishlist}
              cart={cart}
              setCart={setCart}
            />
          }
        />

        <Route
          path="/checkout"
          element={
            <Checkout
              cart={cart}
              setCart={setCart}
              wishlist={wishlist}
            />
          }
        />

        <Route
          path="/order-confirmation"
          element={
            <OrderConfirmation />
          }
        />

        <Route
          path="/orders"
          element={
            <Orders
              cart={cart}
              wishlist={wishlist}
            />
          }
        />

        <Route
          path="/track-order/:orderId"
          element={
            <TrackOrder
              cart={cart}
              wishlist={wishlist}
            />
          }
        />

        <Route
          path="/contact"
          element={
            <Contact
              cart={cart}
              wishlist={wishlist}
            />
          }
        />

        <Route
          path="/about"
          element={
            <About
              cart={cart}
              wishlist={wishlist}
            />
          }
        />

        <Route
          path="/login"
          element={
            <Login
              cart={cart}
              wishlist={wishlist}
            />
          }
        />

        <Route
          path="/complete-profile"
          element={
            <ProtectedRoute requiredRole="customer">
              <CompleteProfile
                cart={cart}
                wishlist={wishlist}
              />
            </ProtectedRoute>
          }
        />

        <Route
          path="/account"
          element={
            <ProtectedRoute requiredRole="customer" requireCompleteProfile={true}>
              <Account
                cart={cart}
                setCart={setCart}
                wishlist={wishlist}
                setWishlist={setWishlist}
              />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/login"
          element={<AdminLogin />}
        />

        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute allowedRoles={["admin", "owner"]}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={["admin", "owner"]}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/owner/login"
          element={<OwnerLogin />}
        />

        <Route
          path="/owner/dashboard"
          element={
            <ProtectedRoute allowedRoles={["owner"]}>
              <OwnerDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="*"
          element={
            <NotFound
              cart={cart}
              wishlist={wishlist}
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;