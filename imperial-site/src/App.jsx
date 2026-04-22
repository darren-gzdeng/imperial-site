import { Routes, Route } from "react-router";
import MainLayout from "./layouts/MainLayout";

import Home from "./pages/Home";
import About from "./pages/About";
import Contact from "./pages/Contact";
import NewArrivals from "./pages/NewArrivals";
import Seafood from "./pages/Seafood";
import Hotpot from "./pages/Hotpot";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Account from "./pages/Account";
import ChefRecipe from "./pages/ChefRecipe";
import ShippingDelivery from "./pages/ShippingDelivery";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";

export default function App() {
  return (
    <Routes>
      {/* Main layout pages */}
      <Route element={<MainLayout />}>
        <Route index element={<Home />} />
        <Route path="about" element={<About />} />
        <Route path="contact" element={<Contact />} />
        <Route path="new-arrivals" element={<NewArrivals />} />
        <Route path="seafood" element={<Seafood />} />
        <Route path="hotpot" element={<Hotpot />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="account" element={<Account />} />
        <Route path="chef-recipe" element={<ChefRecipe />} />
        <Route path="shipping-delivery" element={<ShippingDelivery />} />
        <Route path="privacy-policy" element={<PrivacyPolicy />} />
        <Route path="terms-of-service" element={<TermsOfService />} />
      </Route>
    </Routes>
  );
}