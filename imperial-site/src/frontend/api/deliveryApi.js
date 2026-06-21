import { apiRequest } from "./client";

export function getOrderTracking(orderId) {
  return apiRequest(`/orders/${orderId}/tracking`, {
    auth: true,
  });
}

export function getDriverOrders() {
  return apiRequest("/driver/orders", {
    auth: true,
  });
}

export function getDeliveryChecks() {
  return apiRequest("/delivery-checks", {
    auth: true,
  });
}

export function updateDriverTracking(orderId, payload) {
  return apiRequest(`/driver/orders/${orderId}/tracking`, {
    method: "PUT",
    auth: true,
    body: payload,
  });
}
