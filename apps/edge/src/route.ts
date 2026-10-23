import { isSafeRelativePath, isVersionId } from "@aninir/lab-core";

/** What a /lab/... URL asks for. Pure, so it is easy to test. */
export type LabRoute =
  | { type: "redirect"; location: string }
  | {
      type: "file";
      slug: string;
      /** A pinned version from a preview URL, or null for the live version. */
      version: string | null;
      /** URL prefix that maps to the project root, e.g. /lab/slug/ or /lab/slug/_v/<v>/. */
      base: string;
      /** Path inside the version, "" for the root. Decoded. */
      path: string;
    }
  | { type: "not-found" };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseLabPath(pathname: string, search: string): LabRoute {
  const m = /^\/lab\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!m?.[1] || !SLUG.test(m[1])) return { type: "not-found" };
  const slug = m[1];
  const rest = m[2];
  if (rest === undefined) return { type: "redirect", location: `/lab/${slug}/${search}` };

  let base = `/lab/${slug}/`;
  let version: string | null = null;
  let inner = rest.slice(1);

  const pinned = /^_v\/([^/]+)(\/.*)?$/.exec(inner);
  if (pinned?.[1]) {
    if (!isVersionId(pinned[1])) return { type: "not-found" };
    version = pinned[1];
    base = `/lab/${slug}/_v/${version}/`;
    if (pinned[2] === undefined) return { type: "redirect", location: `${base}${search}` };
    inner = pinned[2].slice(1);
  }

  let path: string;
  try {
    path = decodeURIComponent(inner);
  } catch {
    return { type: "not-found" };
  }
  if (path !== "" && !isSafeRelativePath(path.endsWith("/") ? path.slice(0, -1) : path)) {
    return { type: "not-found" };
  }
  return { type: "file", slug, version, base, path };
}

/** Map a URL path inside a project to the file key: "" → entry, "dir/" → "dir/index.html". */
export function filePathFor(path: string, entry: string): string {
  if (path === "") return entry;
  if (path.endsWith("/")) return `${path}index.html`;
  return path;
}

/** Paths without an extension in their last segment, like `about` or `p/ff0088`. */
export function looksLikeRoute(path: string): boolean {
  const last = path.slice(path.lastIndexOf("/") + 1);
  return !last.includes(".");
}
