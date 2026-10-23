import { env } from "cloudflare:workers";
import type { AppType } from "@aninir/api";
import { hc } from "hono/client";

/**
 * Typed client for the API, called over the service binding (no network hop).
 * Routes, params and response shapes all come from the API's own types.
 */
export const api = hc<AppType>("https://api.internal", {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => env.API.fetch(input, init),
});
