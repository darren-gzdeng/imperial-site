import { useEffect, useState } from "react";
import { Link } from "react-router";
import { CalendarDays, Trash2 } from "lucide-react";
import {
  formatDeliveryDate,
  getCartItems,
  getDefaultDeliveryDate,
  getDeliveryDate,
  removeCartItem,
  saveDeliveryDate,
  updateCartItemQuantity,
} from "../api/cartStorage";
import { getAuthToken } from "../api/client";

const parsePrice = (value) => {
  const price = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(price) ? price : 0;
};

const formatPrice = (value) => `$${value.toFixed(2)}`;

const getShipping = (subtotal) => {
  if (subtotal >= 85) {
    return 0;
  }

  if (subtotal >= 39) {
    return 6.5;
  }

  return 15;
};

const monthLabelFormatter = new Intl.DateTimeFormat("en-AU", { month: "long" });
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const toDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const dateFromKey = (dateKey) => {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return new Date(year, month - 1, day);
};

const buildCalendarDays = (monthDate) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstGridDay = new Date(firstDay);
  firstGridDay.setDate(firstDay.getDate() - ((firstDay.getDay() + 6) % 7));

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstGridDay);
    date.setDate(firstGridDay.getDate() + index);
    return date;
  });
};

const isDeliveryDateDisabled = (date) => {
  const earliest = dateFromKey(getDefaultDeliveryDate());
  earliest.setHours(0, 0, 0, 0);

  const candidate = new Date(date);
  candidate.setHours(0, 0, 0, 0);

  return candidate < earliest || candidate.getDay() === 0;
};

export default function Cart() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [cartItems, setCartItems] = useState([]);
  const [deliveryDate, setDeliveryDate] = useState(getDeliveryDate);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => dateFromKey(getDeliveryDate()));

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
  const calendarDays = buildCalendarDays(calendarMonth);

  const changeCalendarMonth = (direction) => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + direction, 1));
  };

  const selectDeliveryDate = (date) => {
    if (isDeliveryDateDisabled(date)) {
      return;
    }

    const dateKey = toDateKey(date);
    setDeliveryDate(dateKey);
    saveDeliveryDate(dateKey);
    setIsCalendarOpen(false);
  };

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
            <button
              type="button"
              className="cart-delivery-date"
              onClick={() => setIsCalendarOpen((prev) => !prev)}
            >
              <CalendarDays size={24} strokeWidth={1.8} />
              <span>Delivery date: {formatDeliveryDate(deliveryDate)}</span>
            </button>

            {isCalendarOpen && (
              <div className="cart-calendar" role="dialog" aria-label="Select delivery date">
                <p className="cart-calendar__cutoff">Selected-day delivery cut off time: 5:30pm</p>
                <div className="cart-calendar__month">
                  <button type="button" aria-label="Previous month" onClick={() => changeCalendarMonth(-1)}>
                    &lt;
                  </button>
                  <h3>
                    {monthLabelFormatter.format(calendarMonth)}
                    <span>{calendarMonth.getFullYear()}</span>
                  </h3>
                  <button type="button" aria-label="Next month" onClick={() => changeCalendarMonth(1)}>
                    &gt;
                  </button>
                </div>
                <div className="cart-calendar__weekdays">
                  {weekdays.map((day) => <span key={day}>{day}</span>)}
                </div>
                <div className="cart-calendar__grid">
                  {calendarDays.map((date) => {
                    const dateKey = toDateKey(date);
                    const isSelected = dateKey === deliveryDate;
                    const isCurrentMonth = date.getMonth() === calendarMonth.getMonth();
                    const isDisabled = isDeliveryDateDisabled(date);

                    return (
                      <button
                        key={dateKey}
                        type="button"
                        className={[
                          "cart-calendar__day",
                          isSelected ? "cart-calendar__day--selected" : "",
                          !isCurrentMonth ? "cart-calendar__day--muted" : "",
                        ].filter(Boolean).join(" ")}
                        disabled={isDisabled}
                        onClick={() => selectDeliveryDate(date)}
                      >
                        {date.getDate()}
                      </button>
                    );
                  })}
                </div>
                <button type="button" className="cart-calendar__close" onClick={() => setIsCalendarOpen(false)}>
                  x Close
                </button>
              </div>
            )}

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
