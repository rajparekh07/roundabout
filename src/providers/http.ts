import { ProxyError } from "../errors.js";
import type { FetchLike } from "./base.js";

export async function parseJsonResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

export async function ensureOk(response: Response) {
  if (response.ok) {
    return response;
  }

  const payload = await parseJsonResponse(response);
  const message =
    typeof payload === "string"
      ? payload
      : payload?.error?.message ?? payload?.message ?? `Provider error ${response.status}`;

  throw new ProxyError(message, {
    statusCode: mapStatusCode(response.status),
    code: mapErrorCode(response.status),
    retriable: response.status >= 500 || response.status === 429,
    type: "provider_error"
  });
}

export function mapStatusCode(status: number) {
  if (status === 401 || status === 403) {
    return 502;
  }
  return status;
}

export function mapErrorCode(status: number) {
  if (status === 429) {
    return "provider_rate_limited";
  }
  if (status >= 500) {
    return "provider_unavailable";
  }
  if (status === 401 || status === 403) {
    return "provider_auth_failed";
  }
  return "provider_bad_request";
}

export function getFetch(fetcher?: FetchLike) {
  return fetcher ?? fetch;
}
