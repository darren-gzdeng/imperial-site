import { apiRequest } from "./client";

export function getClients() {
  return apiRequest("/clients", { auth: true });
}

export function createClient(payload) {
  return apiRequest("/clients", {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function updateClient(clientId, payload) {
  return apiRequest(`/clients/${clientId}`, {
    method: "PUT",
    auth: true,
    body: payload,
  });
}

export function deleteClient(clientId) {
  return apiRequest(`/clients/${clientId}`, {
    method: "DELETE",
    auth: true,
  });
}
