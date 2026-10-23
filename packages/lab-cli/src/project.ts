import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { formatIssues, LabManifest } from "@aninir/lab-core";

/** Always skipped: dependencies, dotfiles, and project tooling that never belongs online. */
const DEFAULT_EXCLUDE = [
  "node_modules/**",
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "tsconfig.json",
  "lab.json",
];

export interface LocalFile {
  /** Path inside the output folder, with forward slashes. */
  path: string;
  absPath: string;
  size: number;
}

export interface LoadedProject {
  dir: string;
  manifest: LabManifest;
  outDir: string;
  files: LocalFile[];
}

export class ProjectError extends Error {
  readonly problems: string[];

  constructor(dir: string, problems: string[]) {
    super(`${dir}:\n  ${problems.join("\n  ")}`);
    this.problems = problems;
  }
}

/** Read lab.json, list the files to upload and check the manifest against them. */
export function loadProject(dir: string): LoadedProject {
  const root = resolve(dir);
  const manifestPath = join(root, "lab.json");
  if (!existsSync(manifestPath)) throw new ProjectError(dir, ["no lab.json found"]);

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    throw new ProjectError(dir, [`lab.json is not valid JSON: ${(e as Error).message}`]);
  }
  const parsed = LabManifest.safeParse(raw);
  if (!parsed.success) throw new ProjectError(dir, formatIssues(parsed.error));
  const manifest = parsed.data;

  const outDir = resolve(root, manifest.outDir);
  if (!existsSync(outDir)) {
    throw new ProjectError(dir, [`outDir "${manifest.outDir}" does not exist (build first?)`]);
  }

  const exclude = [...DEFAULT_EXCLUDE, ...manifest.exclude];
  const files = walk(outDir).filter((f) => !exclude.some((p) => matches(p, f.path)));

  const problems: string[] = [];
  const paths = new Set(files.map((f) => f.path));
  if (!paths.has(manifest.entry)) problems.push(`entry "${manifest.entry}" is not in the output`);
  if (manifest.thumbnail && !paths.has(manifest.thumbnail)) {
    problems.push(`thumbnail "${manifest.thumbnail}" is not in the output`);
  }
  if (problems.length) throw new ProjectError(dir, problems);

  return { dir: root, manifest, outDir, files };
}

function walk(root: string): LocalFile[] {
  const out: LocalFile[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) visit(abs);
      else if (entry.isFile()) {
        out.push({
          path: relative(root, abs).split(sep).join("/"),
          absPath: abs,
          size: statSync(abs).size,
        });
      }
    }
  };
  visit(root);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Tiny matcher: `dir/**` (prefix), `*.ext` (extension anywhere), or an exact path. */
export function matches(pattern: string, path: string): boolean {
  if (pattern.endsWith("/**")) return path.startsWith(pattern.slice(0, -2));
  if (pattern.startsWith("*.")) return path.endsWith(pattern.slice(1));
  return path === pattern;
}
