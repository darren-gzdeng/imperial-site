import { apiRequest } from "./client";

export function getInvoices(userId) {
  return apiRequest(`/invoices/${userId}`, { auth: true });
}

export function createInvoice(payload) {
  return apiRequest("/invoices", {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function deleteInvoice(invoiceId) {
  return apiRequest(`/invoices/${invoiceId}`, {
    method: "DELETE",
    auth: true,
  });
}

export function downloadInvoicePdf(invoiceId) {
  return apiRequest(`/invoices/${invoiceId}/pdf`, {
    auth: true,
    responseType: "blob",
  });
}
