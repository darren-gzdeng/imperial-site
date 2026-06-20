import { useEffect, useState } from "react";
import { Link } from "react-router";
import { CalendarDays, Trash2 } from "lucide-react";
import { getCartItems, removeCartItem, updateCartItemQuantity } from "../api/cartStorage";
import { getAuthToken } from "../api/client";

const parsePrice = (value) => {
  const price = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(price) ? price : 0;
};

const formatPrice = (value) => `$${value.toFixed(2)}`;

const getDeliveryDate = () => {
  const date = new Date();
  const friday = 5;
  const daysUntilFriday = (friday - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + daysUntilFriday);

  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const getShipping = (subtotal) => {
  if (subtotal >= 85) {
    return 0;
  }

  if (subtotal >= 39) {
    return 6.5;
  }

  return 15;
};

export default function Cart() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [cartItems, setCartItems] = useState([]);

  useEffect(() => {
    setIsLoggedIn(!!getAuthToken());
    setCartItems(getCartItems());
  }, []);

  const changeQuantity = (item, nextQuantity) => {
    setCartItems(updateCartItemQuantity(item.id, nextQuantity));
  };

  const deleteItem = (item) => {
    setCartItems(removeCartItem(item.id));
  };

  const hasItems = cartItems.length > 0;
  const subtotal = cartItems.reduce((sum, item) => sum + parsePrice(item.unit_price) * item.quantity, 0);
  const shipping = getShipping(subtotal);
  const creditCovered = 0;
  const creditBalance = 0;
  const total = subtotal + shipping - creditCovered;

  return (
    <div className="cart-page">
      {hasItems ? (
        <section className="cart-filled-state">
          <div className="cart-filled-header">
            <h1 className="cart-title">Your cart</h1>
            <Link to="/products" className="cart-shopping-link">
              Continue shopping
            </Link>
          </div>

          <div className="cart-table">
            <div className="cart-table-header">
              <span>Product</span>
              <span>Quantity</span>
              <span>Total</span>
            </div>

            {cartItems.map((item) => {
              const unitPrice = parsePrice(item.unit_price);
              const lineTotal = unitPrice * item.quantity;

              return (
                <div key={item.id} className="cart-line-item">
                  <div className="cart-line-product">
                    <img src={item.image} alt={item.name} className="cart-line-image" />
                    <div>
                      <h2>{item.name}</h2>
                      <p>{item.unit_price}</p>
                    </div>
                  </div>

                  <div className="cart-line-controls">
                    <div className="cart-quantity-control" aria-label={`${item.name} quantity`}>
                      <button type="button" onClick={() => changeQuantity(item, item.quantity - 1)}>
                        -
                      </button>
                      <span>{item.quantity}</span>
                      <button type="button" onClick={() => changeQuantity(item, item.quantity + 1)}>
                        +
                      </button>
                    </div>
                    <button type="button" className="cart-delete-button" aria-label={`Remove ${item.name}`} onClick={() => deleteItem(item)}>
                      <Trash2 size={17} strokeWidth={1.8} />
                    </button>
                  </div>

                  <p className="cart-line-total">{formatPrice(lineTotal)}</p>
                </div>
              );
            })}
          </div>

          <section className="cart-checkout-panel" aria-label="Checkout summary">
            <div className="cart-delivery-date">
              <CalendarDays size={24} strokeWidth={1.8} />
              <span>Delivery date: {getDeliveryDate()}</span>
            </div>

            <input className="cart-note-input" placeholder="Leave a note" />

            <div className="cart-summary">
              <div>
                <span>Subtotal</span>
                <strong>{formatPrice(subtotal)}</strong>
              </div>
              <div>
                <span>Shipping</span>
                <strong>{formatPrice(shipping)}</strong>
              </div>
              <div>
                <span>Covered by Credit</span>
                <strong>{formatPrice(creditCovered)}</strong>
              </div>
              <div className="cart-summary-total">
                <span>Total</span>
                <strong>{formatPrice(total)}</strong>
              </div>
            </div>

            <div className="cart-credit-balance">
              <span>Your credit balance</span>
              <strong>{formatPrice(creditBalance)}</strong>
            </div>

            <Link to="/checkout" className="cart-checkout-button">
              Check out
            </Link>
          </section>
        </section>
      ) : (
        <section className="cart-empty-state">
          <h1 className="cart-title">Your cart is empty</h1>

          <Link to="/products" className="cart-continue-link">
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
      )}

      <section className="cart-notes">
        <h2 className="cart-note-heading">Please Note:</h2>

        <p className="cart-note-text">
          <Link to="/login" className="inline-text-link">Login</Link> to find your balance in your account page.
        </p>
      </section>
    </div>
  );
}
