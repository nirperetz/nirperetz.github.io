import { r2Key } from "@aninir/lab-core";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { legacyRedirect } from "./legacy.ts";
import { LabRegistry } from "./registry.ts";
import { filePathFor, looksLikeRoute, parseLabPath } from "./route.ts";
import { serveObject } from "./serve.ts";

interface Env {
  WEB: Fetcher;
  API: Fetcher;
  DB: D1Database;
  LAB_BUCKET: R2Bucket;
  PREVIEW_TOKEN?: string;
}

const PREVIEW_COOKIE = "lab_preview";

const app = new Hono<{ Bindings: Env }>();

// www → apex, and old 2014 URLs → their new homes. Both permanent.
app.use(async (c, next) => {
  const url = new URL(c.req.url);
  if (url.hostname.startsWith("www.")) {
    url.hostname = url.hostname.slice(4);
    return c.redirect(url.toString(), 301);
  }
  const target = legacyRedirect(url.pathname);
  if (target) return c.redirect(target + url.search, 301);
  await next();
});

app.all("/api/*", (c) => c.env.API.fetch(c.req.raw));

app.get("/assets/*", async (c) => {
  const path = decodeURIComponent(c.req.path.slice("/assets/".length));
  const res = await serveObject(c.env.LAB_BUCKET, r2Key.asset(path), c.req.raw, {
    cacheControl: "public, max-age=86400",
    noindex: false,
    crossOriginIsolated: false,
    baseHref: null,
  });
  return res ?? notFoundPage(c.env, c.req.url);
});

app.get("/lab/*", async (c) => {
  const url = new URL(c.req.url);
  const route = parseLabPath(url.pathname, url.search);
  if (route.type === "redirect") return c.redirect(route.location, 301);
  if (route.type === "not-found") return notFoundPage(c.env, c.req.url);

  // ?preview=<token> unlocks drafts for this browser, then drops the token from the URL.
  const token = c.env.PREVIEW_TOKEN;
  if (token && url.searchParams.get("preview") === token) {
    setCookie(c, PREVIEW_COOKIE, token, {
      path: "/lab/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    });
    url.searchParams.delete("preview");
    return c.redirect(url.pathname + url.search, 302);
  }
  const canSeeDrafts = Boolean(token && getCookie(c, PREVIEW_COOKIE) === token);

  const registry = new LabRegistry(c.env.DB);
  const resolved = route.version
    ? await registry.pinned(route.slug, route.version)
    : await registry.live(route.slug);
  if (!resolved || (resolved.manifest.visibility === "draft" && !canSeeDrafts)) {
    return notFoundPage(c.env, c.req.url);
  }

  const { manifest, version } = resolved;
  const opts = {
    cacheControl: route.version ? "public, max-age=31536000, immutable" : "public, max-age=300",
    noindex: route.version !== null || manifest.visibility !== "listed",
    crossOriginIsolated: manifest.crossOriginIsolated,
    baseHref: manifest.spa ? route.base : null,
  };
  const key = (path: string) => r2Key.file(route.slug, version, path);

  const file = await serveObject(
    c.env.LAB_BUCKET,
    key(filePathFor(route.path, manifest.entry)),
    c.req.raw,
    opts,
  );
  if (file) return file;

  if (looksLikeRoute(route.path)) {
    // `/lab/x/docs` where docs/index.html exists → add the slash, like a static server would.
    if (await c.env.LAB_BUCKET.head(key(`${route.path}/index.html`))) {
      return c.redirect(`${url.pathname}/${url.search}`, 301);
    }
    // Client-side routes of single-page apps get the entry document.
    if (manifest.spa) {
      const entry = await serveObject(c.env.LAB_BUCKET, key(manifest.entry), c.req.raw, opts);
      if (entry) return entry;
    }
  }
  return notFoundPage(c.env, c.req.url);
});

// Everything else is the website.
app.all("*", (c) => c.env.WEB.fetch(c.req.raw));

/** The website's branded 404, with a real 404 status. */
async function notFoundPage(env: Env, requestUrl: string): Promise<Response> {
  const page = await env.WEB.fetch(new URL("/404", requestUrl));
  return new Response(page.body, {
    status: 404,
    headers: { "content-type": page.headers.get("content-type") ?? "text/html; charset=utf-8" },
  });
}

export default app;
