const defaultBaseUrl = "http://localhost:8080";

function getBaseUrl() {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (typeof envUrl === "string" && envUrl.length > 0) {
    return envUrl;
  }
  return defaultBaseUrl;
}

export async function apiRequest(path: string, options: RequestInit = {}) {
  const url = getBaseUrl() + path;
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(url, { ...options, headers });
  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    throw { status: response.status, data };
  }
  return data;
}

export function getStoredToken() {
  return window.localStorage.getItem("auth_token") || "";
}

export function setStoredToken(token: string) {
  window.localStorage.setItem("auth_token", token);
}

export function clearStoredToken() {
  window.localStorage.removeItem("auth_token");
}

