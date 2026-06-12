import { useEffect, useState } from "react";
import { Link } from "react-router";
import { getAuthToken } from "../api/client";

export default function Cart() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setIsLoggedIn(!!getAuthToken());
  }, []);

  return (
    <div className="cart-page">
      <section className="cart-empty-state">
        <h1 className="cart-title">Your cart is empty</h1>

        <Link to="/new-arrivals" className="cart-continue-link">
          Continue shopping
        </Link>

        {!isLoggedIn && (
          <div className="cart-account-block">
            <h2 className="cart-account-title">Have an account?</h2>
            <p className="cart-account-text">
              <Link to="/login" className="inline-text-link">Log in</Link> to check out faster.
            </p>
          </div>
        )}
      </section>

      <section className="cart-notes">
        <h2 className="cart-note-heading">Please Note:</h2>

        <p className="cart-note-text">
          <Link to="/login" className="inline-text-link">Login</Link> to find your balance in your account page.
        </p>
      </section>
    </div>
  );
}
