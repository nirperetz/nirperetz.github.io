import { describe, expect, it } from "vitest";
import { isSafeRelativePath, LabManifest, toRuntimeManifest } from "./manifest.ts";
import { createVersionId, isVersionId } from "./version.ts";

describe("LabManifest", () => {
  it("fills defaults for a minimal manifest", () => {
    const m = LabManifest.parse({ slug: "hello", title: "Hello", visibility: "listed" });
    expect(m).toMatchObject({ entry: "index.html", spa: false, outDir: ".", tags: [] });
  });

  it("rejects bad slugs, unknown keys and escaping paths", () => {
    const base = { title: "x", visibility: "listed" };
    expect(LabManifest.safeParse({ ...base, slug: "Hello World" }).success).toBe(false);
    expect(LabManifest.safeParse({ ...base, slug: "ok", colour: "red" }).success).toBe(false);
    expect(LabManifest.safeParse({ ...base, slug: "ok", entry: "../x.html" }).success).toBe(false);
  });

  it("strips build-only fields for runtime", () => {
    const m = LabManifest.parse({ slug: "a1", title: "A", visibility: "draft", outDir: "dist" });
    expect(toRuntimeManifest(m)).not.toHaveProperty("outDir");
  });
});

describe("isSafeRelativePath", () => {
  it.each([
    ["index.html", true],
    ["img/a b.png", true],
    ["/abs", false],
    ["a/../b", false],
    ["a//b", false],
    ["a\\b", false],
  ])("%s → %s", (p, ok) => expect(isSafeRelativePath(p)).toBe(ok));
});

describe("version ids", () => {
  it("sort by time and carry the git sha", () => {
    const a = createVersionId(new Date("2026-10-23T19:04:00.123Z"), "ab12cd3ef");
    const b = createVersionId(new Date("2026-10-24T01:00:00Z"), undefined);
    expect(a).toBe("20261023T190400Z-ab12cd3");
    expect(b).toBe("20261024T010000Z-local");
    expect(isVersionId(a) && isVersionId(b)).toBe(true);
    expect([b, a].sort()).toEqual([a, b]);
  });
});
