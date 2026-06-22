import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Search, HelpCircle, Image as ImageIcon } from "lucide-react";
import { getAccount } from "../api/accountApi";
import { createStripeCheckoutSession, reserveCheckoutStock } from "../api/checkoutApi";
import { getAuthToken } from "../api/client";
import { clearCartItems, formatDeliveryDate, getCartItems, getDeliveryDate } from "../api/cartStorage";
import { loadGoogleMaps } from "../components/maps/googleMapsLoader";

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

const CHECKOUT_RESERVATION_KEY = "imperial_checkout_reservation";
const CHECKOUT_DETAILS_KEY = "imperial_checkout_details";
const pendingReservationRequests = new Map();

const getCartSignature = (items) =>
  JSON.stringify(
    items.map((item) => ({
      product_id: item.product_id || item.id,
      backend_item: item.backend_item || item.name,
      quantity: item.quantity,
    }))
  );

const getStoredReservation = (signature) => {
  try {
    const stored = JSON.parse(localStorage.getItem(CHECKOUT_RESERVATION_KEY) || "{}");
    const expiresAt = stored.expires_at ? new Date(stored.expires_at).getTime() : 0;

    if (stored.signature === signature && stored.reservation_token && expiresAt > Date.now()) {
      return stored;
    }
  } catch {
    return null;
  }

  return null;
};

const formatReservationTime = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

const getAddressComponent = (components = [], type) =>
  components.find((component) => component.types.includes(type))?.long_name || "";

export default function Checkout() {
  const [cartItems, setCartItems] = useState([]);
  const [account, setAccount] = useState(null);
  const [reservationToken, setReservationToken] = useState("");
  const [reservationExpiresAt, setReservationExpiresAt] = useState("");
  const [reservationSecondsRemaining, setReservationSecondsRemaining] = useState(0);
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [checkoutDetails, setCheckoutDetails] = useState({
    country: "Australia",
    first_name: "",
    last_name: "",
    address: "",
    state: "",
    postcode: "",
    phone: "",
  });
  const [selectedAddressPlaceId, setSelectedAddressPlaceId] = useState("");
  const [isReserving, setIsReserving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const didReserve = useRef(false);
  const addressInputRef = useRef(null);
  const autocompleteRef = useRef(null);

  useEffect(() => {
    const items = getCartItems();
    setCartItems(items);

    if (!getAuthToken()) {
      return undefined;
    }

    getAccount()
      .then((accountData) => {
        setAccount(accountData);
        setCheckoutDetails((prev) => ({
          ...prev,
          first_name: accountData.first_name || prev.first_name,
          last_name: accountData.last_name || prev.last_name,
          address: accountData.address || prev.address,
          phone: accountData.phone || prev.phone,
        }));
      })
      .catch(() => setAccount(null));

    return undefined;
  }, []);

  useEffect(() => {
    if (didReserve.current || cartItems.length === 0) {
      return;
    }

    didReserve.current = true;
    const signature = getCartSignature(cartItems);
    const storedReservation = getStoredReservation(signature);

    if (storedReservation) {
      setReservationToken(storedReservation.reservation_token);
      setReservationExpiresAt(storedReservation.expires_at);
      setCheckoutMessage("");
      return;
    }

    setIsReserving(true);
    setCheckoutMessage("");

    if (!pendingReservationRequests.has(signature)) {
      pendingReservationRequests.set(
        signature,
        reserveCheckoutStock(cartItems).then((reservation) => {
          localStorage.setItem(
            CHECKOUT_RESERVATION_KEY,
            JSON.stringify({
              signature,
              reservation_token: reservation.reservation_token,
              expires_at: reservation.expires_at,
            })
          );
          return reservation;
        })
      );
    }

    pendingReservationRequests.get(signature)
      .then((reservation) => {
        setReservationToken(reservation.reservation_token);
        setReservationExpiresAt(reservation.expires_at);
        setCheckoutMessage("");
      })
      .catch((err) => {
        localStorage.removeItem(CHECKOUT_RESERVATION_KEY);
        setReservationExpiresAt("");
        setReservationSecondsRemaining(0);
        clearCartItems();
        setCartItems([]);
        setCheckoutMessage(err.message || "A product in your cart is out of stock. Your cart has been cleared.");
      })
      .finally(() => {
        setIsReserving(false);
        pendingReservationRequests.delete(signature);
      });
  }, [cartItems]);

  useEffect(() => {
    if (!reservationExpiresAt) {
      setReservationSecondsRemaining(0);
      return undefined;
    }

    const updateTimer = () => {
      const secondsRemaining = Math.max(0, Math.ceil((new Date(reservationExpiresAt).getTime() - Date.now()) / 1000));
      setReservationSecondsRemaining(secondsRemaining);

      if (secondsRemaining === 0) {
        localStorage.removeItem(CHECKOUT_RESERVATION_KEY);
        setReservationToken("");
        setCheckoutMessage("Your 10 minute stock hold has expired. Please return to your cart and checkout again.");
      }
    };

    updateTimer();
    const timer = window.setInterval(updateTimer, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [reservationExpiresAt]);

  useEffect(() => {
    if (!addressInputRef.current || autocompleteRef.current) {
      return undefined;
    }

    let cancelled = false;

    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !addressInputRef.current) return;

        autocompleteRef.current = new maps.places.Autocomplete(addressInputRef.current, {
          componentRestrictions: { country: "au" },
          fields: ["address_components", "formatted_address", "place_id"],
          types: ["address"],
        });

        autocompleteRef.current.addListener("place_changed", () => {
          const place = autocompleteRef.current.getPlace();

          if (!place?.place_id || !place.formatted_address) {
            setSelectedAddressPlaceId("");
            return;
          }

          setSelectedAddressPlaceId(place.place_id);
          setCheckoutDetails((prev) => ({
            ...prev,
            country: "Australia",
            address: place.formatted_address,
            state: getAddressComponent(place.address_components, "administrative_area_level_1"),
            postcode: getAddressComponent(place.address_components, "postal_code"),
          }));
        });
      })
      .catch((err) => {
        setCheckoutMessage(err.message || "Address search could not be loaded.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const startStripeCheckout = async () => {
    if (!reservationToken) {
      setCheckoutMessage("Your items are not reserved. Please return to your cart and try again.");
      return;
    }

    const fullAddress = [
      checkoutDetails.address,
    ].filter(Boolean).join(", ");

    if (!selectedAddressPlaceId) {
      setCheckoutMessage("Please select a valid Australian address from the address search.");
      return;
    }

    if (!checkoutDetails.address || !checkoutDetails.state || !checkoutDetails.postcode || !checkoutDetails.phone) {
      setCheckoutMessage("Please enter your delivery address, state, postcode, and phone number.");
      return;
    }

    localStorage.setItem(
      CHECKOUT_DETAILS_KEY,
      JSON.stringify({
        user_id: account?.id,
        customer_name: `${checkoutDetails.first_name} ${checkoutDetails.last_name}`.trim(),
        phone: checkoutDetails.phone,
        shipping_address: fullAddress,
        delivery_date: getDeliveryDate(),
      })
    );

    setIsCompleting(true);
    try {
      const session = await createStripeCheckoutSession(reservationToken);
      window.location.href = session.url;
    } catch (err) {
      setCheckoutMessage(err.message || "Stripe checkout could not be started. Please try again.");
      setIsCompleting(false);
      return;
    }
  };

  const checkoutButtonText = () => {
    if (isCompleting) {
      return "Redirecting to Stripe...";
    }

    if (isReserving) {
      return "Checking stock...";
    }

    return "Continue to Stripe";
  };

  const subtotal = cartItems.reduce((sum, item) => sum + parsePrice(item.unit_price) * item.quantity, 0);
  const shipping = getShipping(subtotal);
  const total = subtotal + shipping;
  const itemCount = cartItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const deliveryDate = getDeliveryDate();
  const initials = account?.first_name?.[0] || account?.email?.[0] || "G";
  const updateCheckoutField = (field, value) => {
    setCheckoutDetails((prev) => ({ ...prev, [field]: value }));
    if (field === "address") {
      setSelectedAddressPlaceId("");
    }
  };

  return (
    <main className="checkout-page">
      <header className="checkout-header">
        <Link to="/" className="checkout-brand">Imperial Ocean</Link>
      </header>

      <div className="checkout-layout">
        <section className="checkout-form-panel" aria-label="Checkout form">
          {account?.email ? (
            <div className="checkout-account">
              <span>{initials.toUpperCase()}</span>
              <strong>{account.email}</strong>
            </div>
          ) : (
            <div className="checkout-login-line">
              <span>Already have an account?</span>
              <Link to="/login">Log in</Link>
            </div>
          )}

          <form className="checkout-form">
            {checkoutMessage && (
              <p className={cartItems.length === 0 ? "checkout-message checkout-message--error" : "checkout-message"}>
                {checkoutMessage}
              </p>
            )}

            <label className="checkout-field checkout-field--full">
              <span>Country/Region</span>
              <select value={checkoutDetails.country} onChange={(event) => updateCheckoutField("country", event.target.value)}>
                <option>Australia</option>
              </select>
            </label>

            <input placeholder="First name" value={checkoutDetails.first_name} onChange={(event) => updateCheckoutField("first_name", event.target.value)} />
            <input placeholder="Last name" value={checkoutDetails.last_name} onChange={(event) => updateCheckoutField("last_name", event.target.value)} />

            <label className="checkout-search-field checkout-field--full">
              <input
                ref={addressInputRef}
                placeholder="Start typing your Australian address"
                value={checkoutDetails.address}
                onChange={(event) => updateCheckoutField("address", event.target.value)}
              />
              <Search size={19} strokeWidth={1.8} />
            </label>

            <input placeholder="State" value={checkoutDetails.state} onChange={(event) => updateCheckoutField("state", event.target.value)} />
            <input placeholder="Postcode" value={checkoutDetails.postcode} onChange={(event) => updateCheckoutField("postcode", event.target.value)} />

            <label className="checkout-search-field checkout-field--full">
              <input placeholder="Phone" value={checkoutDetails.phone} onChange={(event) => updateCheckoutField("phone", event.target.value)} />
              <HelpCircle size={18} strokeWidth={1.8} />
            </label>

            <button
              type="button"
              className="checkout-pay-button"
              disabled={isReserving || isCompleting || cartItems.length === 0 || !reservationToken || reservationSecondsRemaining === 0}
              onClick={startStripeCheckout}
            >
              {checkoutButtonText()}
            </button>
          </form>
        </section>

        <aside className="checkout-summary-panel" aria-label="Order summary">
          {cartItems.length === 0 ? (
            <div className="checkout-empty-summary">
              <ImageIcon size={28} strokeWidth={1.6} />
              <p>Your cart is empty.</p>
            </div>
          ) : (
            <div className="checkout-summary-items">
              {cartItems.map((item) => (
                <div key={item.id} className="checkout-summary-item">
                  <div className="checkout-summary-image-wrap">
                    <img src={item.image} alt={item.name} />
                    <span>{item.quantity}</span>
                  </div>
                  <h2>{item.name}</h2>
                  <strong>{formatPrice(parsePrice(item.unit_price) * item.quantity)}</strong>
                </div>
              ))}
            </div>
          )}

          <div className="checkout-gift-card">
            <input placeholder="Gift card" />
            <button type="button">Apply</button>
          </div>

          <div className="checkout-totals">
            <div>
              <span>Delivery date</span>
              <strong data-no-translate>{formatDeliveryDate(deliveryDate)}</strong>
            </div>
            {reservationToken && reservationSecondsRemaining > 0 && (
              <div className="checkout-reservation-timer">
                <span>Your orders expire in</span>
                <strong data-no-translate>{formatReservationTime(reservationSecondsRemaining)}</strong>
              </div>
            )}
            <div>
              <span>
                <span>Subtotal</span>
                {" · "}
                <span data-no-translate>{itemCount} items</span>
              </span>
              <strong data-no-translate>{formatPrice(subtotal)}</strong>
            </div>
            <div>
              <span>Shipping policy <HelpCircle size={14} strokeWidth={1.8} /></span>
              <strong data-no-translate>{shipping === 0 ? "Free" : formatPrice(shipping)}</strong>
            </div>
            <div className="checkout-total-row">
              <span>Total</span>
              <strong data-no-translate><small>AUD</small> {formatPrice(total)}</strong>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
