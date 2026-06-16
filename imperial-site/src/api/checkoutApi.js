import { apiRequest } from "./client";

export function reserveCheckoutStock(items) {
  return apiRequest("/checkout/reserve", {
    method: "POST",
    body: { items },
  });
}

export function completeCheckoutReservation(reservationToken) {
  return apiRequest(`/checkout/reservations/${reservationToken}/complete`, {
    method: "POST",
  });
}

export function createStripeCheckoutSession(reservationToken) {
  return apiRequest("/checkout/stripe-session", {
    method: "POST",
    body: { reservation_token: reservationToken },
  });
}
