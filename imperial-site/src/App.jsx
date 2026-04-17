import { Routes, Route } from "react-router";
import MainLayout from "./layouts/MainLayout";
import Home from "./pages/Home";
import About from "./pages/About";
import Contact from "./pages/Contact";
import NewArrivals from "./pages/NewArrivals";
import Seafood from "./pages/Seafood";
import Hotpot from "./pages/Hotpot";

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route index element={<Home />} />
        <Route path="about" element={<About />} />
        <Route path="contact" element={<Contact />} />
        <Route path="new-arrivals" element={<NewArrivals />} />
        <Route path="seafood" element={<Seafood />} />
        <Route path="hotpot" element={<Hotpot />} />
      </Route>
    </Routes>
  );
}