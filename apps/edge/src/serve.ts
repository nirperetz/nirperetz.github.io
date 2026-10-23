import { isHtml } from "@aninir/lab-core";

export interface ServeOptions {
  /** Cache-Control for non-HTML files. HTML is always revalidated. */
  cacheControl: string;
  noindex: boolean;
  crossOriginIsolated: boolean;
  /** Inject <base href> into HTML (SPA projects, so deep links resolve relative URLs). */
  baseHref: string | null;
}

/**
 * Stream one R2 object as an HTTP response. Handles conditional requests (304)
 * and byte ranges (206, for audio and video). Returns null when the key is missing.
 */
export async function serveObject(
  bucket: R2Bucket,
  key: string,
  request: Request,
  opts: ServeOptions,
): Promise<Response | null> {
  const html = isHtml(key);
  // Injected <base> changes the bytes, so ranges and ETag-based 304s only apply to untouched files.
  const rewrite = html && opts.baseHref !== null;
  const obj = await bucket.get(
    key,
    rewrite ? {} : { onlyIf: request.headers, range: request.headers },
  );
  if (!obj) return null;

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", html ? "no-cache" : opts.cacheControl);
  headers.set("x-content-type-options", "nosniff");
  if (!rewrite) headers.set("accept-ranges", "bytes");
  if (opts.noindex) headers.set("x-robots-tag", "noindex");
  if (opts.crossOriginIsolated) {
    headers.set("cross-origin-opener-policy", "same-origin");
    headers.set("cross-origin-embedder-policy", "require-corp");
    headers.set("cross-origin-resource-policy", "same-origin");
  }

  if (!("body" in obj)) return new Response(null, { status: 304, headers });

  let status = 200;
  if (obj.range && request.headers.has("range")) {
    const { offset, length } = rangeBounds(obj.range, obj.size);
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set("content-length", String(length));
    status = 206;
  }

  const response = new Response(obj.body, { status, headers });
  if (!rewrite || !opts.baseHref) return response;
  const href = opts.baseHref;
  headers.delete("etag");
  return new HTMLRewriter()
    .on("head", {
      element(el) {
        el.prepend(`<base href="${href}">`, { html: true });
      },
    })
    .transform(response);
}

function rangeBounds(range: R2Range, size: number): { offset: number; length: number } {
  if ("suffix" in range && range.suffix !== undefined) {
    const length = Math.min(range.suffix, size);
    return { offset: size - length, length };
  }
  const offset = "offset" in range && range.offset !== undefined ? range.offset : 0;
  const length = "length" in range && range.length !== undefined ? range.length : size - offset;
  return { offset, length };
}
