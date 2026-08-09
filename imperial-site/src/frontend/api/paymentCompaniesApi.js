import { apiRequest } from "./client";

export function getPaymentCompanies() {
  return apiRequest("/payment-companies", { auth: true });
}

export function createPaymentCompany(payload) {
  return apiRequest("/payment-companies", {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function updatePaymentCompany(companyId, payload) {
  return apiRequest(`/payment-companies/${companyId}`, {
    method: "PUT",
    auth: true,
    body: payload,
  });
}

export function deletePaymentCompany(companyId) {
  return apiRequest(`/payment-companies/${companyId}`, {
    method: "DELETE",
    auth: true,
  });
}
