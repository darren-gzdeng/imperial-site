import { apiRequest } from "./client";

export function getAccount() {
  return apiRequest("/account", { auth: true });
}

export function updateAccount(payload) {
  return apiRequest("/account", {
    method: "PUT",
    auth: true,
    body: payload,
  });
}

export function getAdminUsers() {
  return apiRequest("/admin/users", { auth: true });
}

export function updateUserAccountType(userId, accountType) {
  return apiRequest(`/admin/users/${userId}/account-type`, {
    method: "PUT",
    auth: true,
    body: { account_type: accountType },
  });
}

export function deleteAdminUser(userId) {
  return apiRequest(`/admin/users/${userId}`, {
    method: "DELETE",
    auth: true,
  });
}
