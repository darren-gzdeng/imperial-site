import { apiRequest } from "./client";

export function getInventory() {
  return apiRequest("/inventory", { auth: true });
}

export function getInventoryHistory(productId, { page = 1, pageSize = 8 } = {}) {
  return apiRequest(`/inventory/${productId}/history?page=${page}&page_size=${pageSize}`, { auth: true });
}

export function addStock(productId, payload) {
  return apiRequest(`/inventory/${productId}/stock-in`, {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function removeStock(productId, payload) {
  return apiRequest(`/inventory/${productId}/stock-out`, {
    method: "POST",
    auth: true,
    body: payload,
  });
}
