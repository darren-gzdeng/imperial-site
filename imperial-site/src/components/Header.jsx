import { Link } from "react-router";
import { Search, User, ShoppingBag, Languages, ChevronDown } from "lucide-react";

const navItems = [
  { label: "Home", path: "/" },
  { label: "About", path: "/about" },
  { label: "New Arrivals", path: "/new-arrivals" },
  { label: "Seafood & Sashimi", path: "/seafood", hasDropdown: true },
  { label: "For Hotpot", path: "/hotpot", hasDropdown: true },
  { label: "Contact Us", path: "/contact", hasDropdown: false },
];

export default function Header() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <div className="header-top">
          <div className="brand-wrap">
            <Link to="/" className="brand">
              Imperial Ocean Select
            </Link>
          </div>
          <div className="header-actions">
            <button className="icon-btn" aria-label="Search">
              <Search size={20} strokeWidth={2} />
            </button>
            <Link to="/login" className="icon-btn" aria-label="Account">
              <User size={20} strokeWidth={2} />
            </Link>
            <button className="icon-btn" aria-label="Cart">
              <ShoppingBag size={20} strokeWidth={2} />
            </button>
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