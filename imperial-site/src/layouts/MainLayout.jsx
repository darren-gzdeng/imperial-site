import { Outlet } from "react-router";
import Header from "../components/Header";
import Footer from "../components/Footer";

export default function MainLayout() {
  return (
    <div className="app-shell">
      <Header />
      <main className="page-container">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}