import { apiRequest } from "./client";

export function login(payload) {
  return apiRequest("/login", {
    method: "POST",
    body: payload,
  });
}

export function googleLogin(payload) {
  return apiRequest("/google-login", {
    method: "POST",
    body: payload,
  });
}

export function register(payload) {
  return apiRequest("/register", {
    method: "POST",
    body: payload,
  });
}

export function requestPasswordReset(payload) {
  return apiRequest("/forgot-password", {
    method: "POST",
    body: payload,
  });
}
