/**
 * Old 2014 URLs → their new homes. Everything the 2014 site served at the root
 * now lives in the `archive` project, and letTheSunShineIn is its own project.
 * legacy.test.ts checks this list against projects/archive so they can't drift.
 */

export const ARCHIVE = "/lab/archive/";

/** Root-level pages of the 2014 site. */
export const LEGACY_PAGES = [
  "corridor.html",
  "cubism.html",
  "desk.html",
  "id.html",
  "index.html",
  "island.html",
  "liri.html",
  "panorama.html",
  "peach.htm",
  "project.html",
  "pyramidBlending.html",
  "sketches.html",
  "spotIt.html",
  "thumbWalk.html",
] as const;

/** Root-level folders of the 2014 site (images, scripts, styles linked from old pages). */
export const LEGACY_DIRS = [
  "img",
  "js",
  "style",
  "sss",
  "Infinite Scroll Demo 3 - SitePoint_files",
] as const;

const PREFIXES: ReadonlyArray<readonly [from: string, to: string]> = [
  ["/letTheSunShineIn/", "/lab/let-the-sunshine-in/"],
  ...LEGACY_DIRS.map((d) => [`/${encodeURI(d)}/`, `${ARCHIVE}${encodeURI(d)}/`] as const),
];

const PAGES = new Map<string, string>([
  ["/letTheSunShineIn", "/lab/let-the-sunshine-in/"],
  ["/index.html", ARCHIVE],
  ...LEGACY_PAGES.filter((p) => p !== "index.html").map(
    (p) => [`/${p}`, `${ARCHIVE}${p}`] as const,
  ),
]);

/** The new location for an old path (raw, still percent-encoded), or null if it isn't one. */
export function legacyRedirect(pathname: string): string | null {
  const page = PAGES.get(pathname);
  if (page) return page;
  for (const [from, to] of PREFIXES) {
    if (pathname.startsWith(from)) return to + pathname.slice(from.length);
  }
  return null;
}
