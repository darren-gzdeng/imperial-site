import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { completeCheckoutReservation } from "../api/checkoutApi";
import { clearCartItems } from "../api/cartStorage";

const CHECKOUT_RESERVATION_KEY = "imperial_checkout_reservation";

export default function CheckoutSuccess() {
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("Finalising your order...");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const reservationToken = searchParams.get("reservation_token");

    if (!reservationToken) {
      setIsError(true);
      setMessage("Missing checkout reservation. Please contact us if payment was taken.");
      return;
    }

    completeCheckoutReservation(reservationToken)
      .then(() => {
        clearCartItems();
        localStorage.removeItem(CHECKOUT_RESERVATION_KEY);
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
        <Link to="/products">Continue shopping</Link>
      </section>
    </main>
  );
}
