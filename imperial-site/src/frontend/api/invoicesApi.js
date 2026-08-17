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

export function updateInvoice(invoiceId, payload) {
  return apiRequest(`/invoices/${invoiceId}`, {
    method: "PATCH",
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

export function sendInvoice(invoiceId) {
  return apiRequest(`/invoices/${invoiceId}/send`, {
    method: "POST",
    auth: true,
  });
}

export function markInvoicePaid(invoiceId) {
  return apiRequest(`/invoices/${invoiceId}/mark-paid`, {
    method: "POST",
    auth: true,
  });
}

export function cancelInvoice(invoiceId) {
  return apiRequest(`/invoices/${invoiceId}/cancel`, {
    method: "POST",
    auth: true,
  });
}

export function downloadInvoicePdf(invoiceId) {
  return apiRequest(`/invoices/${invoiceId}/pdf`, {
    auth: true,
    responseType: "blob",
  });
}
