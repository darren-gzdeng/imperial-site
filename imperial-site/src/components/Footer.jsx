import { Link } from "react-router";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-grid">
          <div className="footer-column">
            <p className="footer-title">MORE ON IMPERIAL OCEAN</p>
            <Link to="/about" className="footer-link">About Us</Link>
            <Link to="/new-arrivals" className="footer-link">Chef&apos;s Recipe</Link>
            <Link to="/seafood" className="footer-link">Imperial Seafood Guide</Link>
          </div>
          <div className="footer-column">
            <p className="footer-title">GET IN TOUCH</p>
            <Link to="/contact" className="footer-link">Contact Us</Link>
          </div>
          <div className="footer-column">
            <p className="footer-title">POLICIES</p>
            <a href="#" className="footer-link">Shipping & Delivery</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="footer-social">
            <a href="#" className="social-link">Instagram</a>
            <a href="#" className="social-link">TikTok</a>
            <a href="#" className="social-link">RedNote</a>
          </div>
          <p className="footer-copy">© 2026 Imperial Ocean Select</p>
        </div>
      </div>
    </footer>
  );
}
