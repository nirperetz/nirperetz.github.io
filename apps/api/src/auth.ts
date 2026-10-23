import { createMiddleware } from "hono/factory";
import type { AppEnv } from "./env.ts";
import { ApiFailure } from "./errors.ts";

/** Sets `authed` when the request carries the deploy token. Never rejects on its own. */
export const readAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const expected = c.env.LAB_DEPLOY_TOKEN;
  c.set("authed", Boolean(token && expected && (await safeEqual(token, expected))));
  await next();
});

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get("authed"))
    throw new ApiFailure(401, "unauthorized", "missing or invalid deploy token");
  await next();
});

/** Constant-time compare. Hashing first makes both sides the same length. */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
