const DEFAULT_OPERATOROS_BASE_URL = "https://operatoros.net";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getOperatorOsBaseUrl(): string {
  return trimTrailingSlash(
    (import.meta.env.VITE_OPERATOROS_BASE_URL as string | undefined) ||
      DEFAULT_OPERATOROS_BASE_URL,
  );
}

export function getOperatorOsLoginUrl(): string {
  return (
    (import.meta.env.VITE_OPERATOROS_AUTH_URL as string | undefined) ||
    `${getOperatorOsBaseUrl()}/login`
  );
}

export function getOperatorOsBillingUrl(): string {
  return (
    (import.meta.env.VITE_OPERATOROS_BILLING_URL as string | undefined) ||
    `${getOperatorOsBaseUrl()}/pricing`
  );
}

export function getOperatorOsRequestAccessUrl(): string {
  return (
    (import.meta.env.VITE_OPERATOROS_REQUEST_ACCESS_URL as string | undefined) ||
    `${getOperatorOsBaseUrl()}/pricing`
  );
}

export function withReturnTo(url: string, returnTo: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}return_to=${encodeURIComponent(returnTo)}`;
}

export function getCurrentReturnUrl(): string {
  if (typeof window === "undefined") return "https://techdeck.operatoros.net";
  return window.location.href;
}
