import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LEGACY_DIRS, LEGACY_PAGES, legacyRedirect } from "./legacy.ts";

const archiveDir = fileURLToPath(new URL("../../../projects/archive", import.meta.url));

describe("legacy redirects", () => {
  it("cover every page and folder the 2014 site had at its root", () => {
    const entries = readdirSync(archiveDir, { withFileTypes: true });
    const pages = entries.filter((e) => e.isFile() && /\.html?$/.test(e.name)).map((e) => e.name);
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    expect([...LEGACY_PAGES].sort()).toEqual(pages.sort());
    expect([...LEGACY_DIRS].sort()).toEqual(dirs.sort());
  });

  it.each([
    ["/corridor.html", "/lab/archive/corridor.html"],
    ["/index.html", "/lab/archive/"],
    ["/img/sketches/1.jpg", "/lab/archive/img/sketches/1.jpg"],
    [
      "/Infinite%20Scroll%20Demo%203%20-%20SitePoint_files/1.jpg",
      "/lab/archive/Infinite%20Scroll%20Demo%203%20-%20SitePoint_files/1.jpg",
    ],
    ["/letTheSunShineIn", "/lab/let-the-sunshine-in/"],
    ["/letTheSunShineIn/shaders.html", "/lab/let-the-sunshine-in/shaders.html"],
  ])("%s → %s", (from, to) => expect(legacyRedirect(from)).toBe(to));

  it("leaves new paths alone", () => {
    for (const p of ["/", "/about", "/lab/archive/", "/imgs/x.png", "/api/projects"]) {
      expect(legacyRedirect(p)).toBeNull();
    }
  });
});
