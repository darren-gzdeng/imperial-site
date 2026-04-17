import { Outlet } from "react-router";
import Header from "../components/Header";

export default function MainLayout() {
  return (
    <>
      <Header />
      <main className="page-container">
        <Outlet />
      </main>
    </>
  );
}