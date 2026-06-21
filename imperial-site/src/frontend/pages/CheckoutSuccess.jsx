import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { completeCheckoutReservation } from "../api/checkoutApi";
import { clearCartItems } from "../api/cartStorage";

const CHECKOUT_RESERVATION_KEY = "imperial_checkout_reservation";
const CHECKOUT_DETAILS_KEY = "imperial_checkout_details";

export default function CheckoutSuccess() {
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("Finalising your order...");
  const [isError, setIsError] = useState(false);
  const [orderId, setOrderId] = useState("");

  useEffect(() => {
    const reservationToken = searchParams.get("reservation_token");

    if (!reservationToken) {
      setIsError(true);
      setMessage("Missing checkout reservation. Please contact us if payment was taken.");
      return;
    }

    let checkoutDetails = {};
    try {
      checkoutDetails = JSON.parse(localStorage.getItem(CHECKOUT_DETAILS_KEY) || "{}");
    } catch {
      checkoutDetails = {};
    }

    completeCheckoutReservation(reservationToken, checkoutDetails)
      .then((data) => {
        clearCartItems();
        localStorage.removeItem(CHECKOUT_RESERVATION_KEY);
        localStorage.removeItem(CHECKOUT_DETAILS_KEY);
        setOrderId(data.order_id || "");
        setMessage("Payment received. Your order has been placed.");
      })
      .catch((err) => {
        setIsError(true);
        setMessage(err.message || "Payment returned, but the order could not be finalised.");
      });
  }, [searchParams]);

  return (
    <main className="checkout-result-page">
      <section className={isError ? "checkout-result checkout-result--error" : "checkout-result"}>
        <h1>{isError ? "Checkout needs attention" : "Thank you"}</h1>
        <p>{message}</p>
        {orderId ? <Link to={`/delivery-tracking/${orderId}`}>Track delivery</Link> : null}
        <Link to="/products">Continue shopping</Link>
      </section>
    </main>
  );
}
