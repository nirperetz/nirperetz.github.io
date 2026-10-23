import { z } from "zod";

/** Who can see a project. */
export const VISIBILITIES = ["listed", "unlisted", "draft"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/** Suggested kinds. `kind` is a free string, so new categories need no schema change. */
export const SUGGESTED_KINDS = ["3d", "shader", "game", "app", "interactive", "archive"] as const;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A path inside the project's output folder: relative, no `..`, no backslashes. */
const relativePath = z
  .string()
  .min(1)
  .refine((p) => isSafeRelativePath(p), "must be a relative path inside the project");

/**
 * The lab.json contract. The only thing the platform knows about a project.
 * Build-only fields (`outDir`, `exclude`) are read by the CLI and ignored at runtime.
 */
export const LabManifest = z
  .object({
    $schema: z.string().optional(),
    slug: z.string().min(2).max(64).regex(SLUG, "kebab-case: lowercase letters, digits, dashes"),
    title: z.string().min(1).max(120),
    visibility: z.enum(VISIBILITIES),
    kind: z.string().min(1).max(32).default("interactive"),
    description: z.string().max(500).default(""),
    tags: z.array(z.string().min(1).max(32)).max(16).default([]),
    year: z.number().int().min(1990).max(2100).optional(),
    thumbnail: relativePath.optional(),
    entry: relativePath.default("index.html"),
    /** Unknown paths fall back to `entry`, served with a <base> pointing at the project root. */
    spa: z.boolean().default(false),
    /** Send COOP/COEP so SharedArrayBuffer and threaded WASM work. */
    crossOriginIsolated: z.boolean().default(false),
    /** Folder to upload, relative to lab.json. Defaults to the project folder itself. */
    outDir: z.string().default("."),
    /** Extra glob-ish patterns to skip when uploading (`dir/**`, `*.ext`, exact paths). */
    exclude: z.array(z.string()).default([]),
  })
  .strict();

export type LabManifest = z.output<typeof LabManifest>;
export type LabManifestInput = z.input<typeof LabManifest>;

/** The runtime part of a manifest: what the API stores and the edge reads. */
export type RuntimeManifest = Omit<LabManifest, "$schema" | "outDir" | "exclude">;

export function toRuntimeManifest(m: LabManifest): RuntimeManifest {
  const { $schema: _s, outDir: _o, exclude: _e, ...runtime } = m;
  return runtime;
}

export function isSafeRelativePath(p: string): boolean {
  if (p.startsWith("/") || p.includes("\\") || p.includes("\0")) return false;
  return p.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
}

export interface IssueList {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}

/** Format zod issues as one line per problem, for CLI and API error messages. */
export function formatIssues(error: IssueList): string[] {
  return error.issues.map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`);
}
