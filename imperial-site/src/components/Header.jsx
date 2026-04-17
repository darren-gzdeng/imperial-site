import { Link } from "react-router";

export default function Header() {
  return (
    <header className="site-header">
      <nav className="site-nav">
        <div className="logo">Imperial Site</div>
        <ul className="nav-links">
          <li><Link to="/">Home</Link></li>
          <li><Link to="/about">About</Link></li>
          <li><Link to="/contact">Contact</Link></li>
        </ul>
      </nav>
    </header>
  );
}