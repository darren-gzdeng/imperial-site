export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5000";

export function getAuthToken() {
  return localStorage.getItem("token");
}

export function setAuthToken(token) {
  localStorage.setItem("token", token);
}

export function clearAuthToken() {
  localStorage.removeItem("token");
}

function buildHeaders({ auth = false, json = false, headers = {} } = {}) {
  const nextHeaders = { ...headers };

  if (json) {
    nextHeaders["Content-Type"] = "application/json";
  }

  if (auth) {
    const token = getAuthToken();
    if (token) {
      nextHeaders.Authorization = token;
    }
  }

  return nextHeaders;
}

async function parseResponse(response, responseType) {
  if (responseType === "blob") {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(response, errorData);
    }

    return response.blob();
  }

  const raw = await response.text();
  let data = {};

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { error: raw || "Unexpected server response" };
  }

  if (!response.ok) {
    throw new ApiError(response, data);
  }

  return data;
}

export class ApiError extends Error {
  constructor(response, data = {}) {
    super(data.error || data.message || `Request failed with status ${response.status}`);
    this.name = "ApiError";
    this.status = response.status;
    this.data = data;
  }
}

export async function apiRequest(path, options = {}) {
  const {
    method = "GET",
    body,
    auth = false,
    responseType = "json",
    headers,
  } = options;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: buildHeaders({ auth, json: body !== undefined, headers }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return parseResponse(response, responseType);
}
