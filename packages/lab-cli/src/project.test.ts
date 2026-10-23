import { describe, expect, it } from "vitest";
import { matches } from "./project.ts";

describe("exclude matching", () => {
  it.each([
    ["node_modules/**", "node_modules/three/index.js", true],
    ["node_modules/**", "src/node_modules.ts", false],
    ["*.map", "assets/main.js.map", true],
    ["README", "README", true],
    ["README", "docs/README", false],
  ])("%s vs %s → %s", (pattern, path, expected) => expect(matches(pattern, path)).toBe(expected));
});
