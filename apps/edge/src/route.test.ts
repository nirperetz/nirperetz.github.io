import { describe, expect, it } from "vitest";
import { filePathFor, looksLikeRoute, parseLabPath } from "./route.ts";

const V = "20261023T190400Z-ab12cd3";

describe("parseLabPath", () => {
  it("adds the trailing slash so relative URLs resolve", () => {
    expect(parseLabPath("/lab/sun", "?x=1")).toEqual({
      type: "redirect",
      location: "/lab/sun/?x=1",
    });
    expect(parseLabPath(`/lab/sun/_v/${V}`, "")).toEqual({
      type: "redirect",
      location: `/lab/sun/_v/${V}/`,
    });
  });

  it("parses live and pinned file paths", () => {
    expect(parseLabPath("/lab/sun/img/a%20b.png", "")).toEqual({
      type: "file",
      slug: "sun",
      version: null,
      base: "/lab/sun/",
      path: "img/a b.png",
    });
    expect(parseLabPath(`/lab/sun/_v/${V}/`, "")).toMatchObject({ version: V, path: "" });
  });

  it("rejects bad slugs, versions and traversal", () => {
    for (const p of [
      "/lab/Sun/",
      "/lab/sun/_v/latest/",
      "/lab/sun/a/../../x",
      "/lab/sun/%E0%A4%A",
    ]) {
      expect(parseLabPath(p, "").type).toBe("not-found");
    }
  });
});

describe("file resolution", () => {
  it("maps directories to index.html and the root to the entry", () => {
    expect(filePathFor("", "main.html")).toBe("main.html");
    expect(filePathFor("docs/", "index.html")).toBe("docs/index.html");
    expect(filePathFor("a.js", "index.html")).toBe("a.js");
  });

  it("detects client routes", () => {
    expect(looksLikeRoute("p/ff0088")).toBe(true);
    expect(looksLikeRoute("assets/main.js")).toBe(false);
  });
});
