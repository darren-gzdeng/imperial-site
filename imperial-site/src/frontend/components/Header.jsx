import { useState, useEffect } from "react";
import { Link } from "react-router";
import { Search, User, ShoppingBag, Languages, ChevronDown } from "lucide-react";
import { CART_UPDATED_EVENT, getCartCount } from "../api/cartStorage";

const navItems = [
  { label: "Home", path: "/" },
  { label: "About", path: "/about" },
  { label: "Products", path: "/products" },
  { label: "New Arrivals", path: "/new-arrivals" },
  { label: "Seafood & Sashimi", path: "/seafood", hasDropdown: true },
  { label: "For Hotpot", path: "/hotpot", hasDropdown: true },
  { label: "Contact Us", path: "/contact", hasDropdown: false },
];

export default function Header() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem("token");
    setIsLoggedIn(!!token);
    setCartCount(getCartCount());

    const updateCartCount = () => {
      setCartCount(getCartCount());
    };

    window.addEventListener(CART_UPDATED_EVENT, updateCartCount);
    window.addEventListener("storage", updateCartCount);

    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, updateCartCount);
      window.removeEventListener("storage", updateCartCount);
    };
  }, []);

  const accountPath = isLoggedIn ? "/account" : "/login";

  return (
    <header className="site-header">
      <div className="header-inner">
        <div className="header-top">
          <div className="brand-wrap">
            <Link to="/" className="brand">
              Imperial Ocean
            </Link>
          </div>
          <div className="header-actions">
            <button className="icon-btn" aria-label="Search">
              <Search size={20} strokeWidth={2} />
            </button>
            <Link to={accountPath} className="icon-btn" aria-label="Account">
              <User size={20} strokeWidth={2} />
            </Link>
            <Link to="/cart" className="icon-btn" aria-label="Cart">
              <ShoppingBag size={20} strokeWidth={2} />
              {cartCount > 0 && <span className="cart-count-badge">{cartCount}</span>}
            </Link>
            <button className="icon-btn" aria-label="Language">
              <Languages size={20} strokeWidth={2} />
            </button>
          </div>
        </div>
      <div className="header-bottom">
        <nav className="main-nav">
          {navItems.map((item) => (
            <Link key={item.label} to={item.path} className="nav-item">
              <span>{item.label}</span>
              {item.hasDropdown && <ChevronDown size={14} strokeWidth={1.8} />}
            </Link>
          ))}
        </nav>
      </div>
      </div>
    </header>
  );
}
