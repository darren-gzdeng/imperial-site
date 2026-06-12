import { apiRequest } from "./client";

export function getProducts() {
  return apiRequest("/products", { auth: true });
}

export function createProduct(payload) {
  return apiRequest("/products", {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function updateProduct(productId, payload) {
  return apiRequest(`/products/${productId}`, {
    method: "PUT",
    auth: true,
    body: payload,
  });
}

export function deleteProduct(productId) {
  return apiRequest(`/products/${productId}`, {
    method: "DELETE",
    auth: true,
  });
}
