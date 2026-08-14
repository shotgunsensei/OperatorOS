let cachedCsrfToken: string | null = null;

export async function getCsrfToken(): Promise<string> {
  if (cachedCsrfToken) return cachedCsrfToken;

  const response = await fetch("/api/auth/csrf-token", {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch CSRF token");
  }

  const data = await response.json();
  cachedCsrfToken = data.csrfToken;
  return cachedCsrfToken!;
}

export function clearCsrfToken(): void {
  cachedCsrfToken = null;
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const csrfToken = await getCsrfToken();

  const headers = new Headers(options.headers);
  headers.set("x-csrf-token", csrfToken);

  if (options.body && typeof options.body === "string" && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });
}
