#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { toRuntimeManifest } from "@aninir/lab-core";
import { LabClient } from "./client.ts";
import { type LoadedProject, loadProject, ProjectError } from "./project.ts";

const HELP = `lab: deploy projects to aninir.com/lab

Usage
  lab validate <dir...>             check lab.json and the build output
  lab deploy <dir> [--no-live]      upload a new version and make it live
  lab rollback <slug> [version]     point live at an older version (default: previous)
  lab versions <slug>               list a project's versions
  lab list                          list listed projects

Environment
  LAB_API           API origin (default https://aninir.com)
  LAB_DEPLOY_TOKEN  bearer token for deploy, rollback and versions`;

const UPLOAD_CONCURRENCY = 6;

async function main(argv: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { "no-live": { type: "boolean" }, help: { type: "boolean", short: "h" } },
  });
  const [command, ...args] = positionals;
  if (!command || values.help) return console.log(HELP);

  const client = () =>
    new LabClient(process.env.LAB_API ?? "https://aninir.com", process.env.LAB_DEPLOY_TOKEN);

  switch (command) {
    case "validate":
      return validate(args.length ? args : ["."]);
    case "deploy": {
      const [dir] = args;
      if (!dir) throw new UsageError("lab deploy <dir>");
      return deploy(client(), loadProject(dir), !values["no-live"]);
    }
    case "rollback": {
      const [slug, version] = args;
      if (!slug) throw new UsageError("lab rollback <slug> [version]");
      return rollback(client(), slug, version);
    }
    case "versions": {
      const [slug] = args;
      if (!slug) throw new UsageError("lab versions <slug>");
      const { versions } = await client().listVersions(slug);
      for (const v of versions) {
        console.log(
          `${v.live ? "*" : " "} ${v.version}  ${v.status.padEnd(9)} ${v.fileCount} files`,
        );
      }
      return;
    }
    case "list": {
      const { projects } = await client().listProjects();
      for (const p of projects) console.log(`${p.slug.padEnd(28)} ${p.kind.padEnd(12)} ${p.title}`);
      return;
    }
    default:
      throw new UsageError(`unknown command "${command}"\n\n${HELP}`);
  }
}

function validate(dirs: string[]): void {
  let failed = 0;
  for (const dir of dirs) {
    try {
      const p = loadProject(dir);
      console.log(
        `ok   ${p.manifest.slug} (${p.files.length} files, ${formatBytes(totalBytes(p))})`,
      );
    } catch (e) {
      if (!(e instanceof ProjectError)) throw e;
      failed++;
      console.error(`fail ${e.message}`);
    }
  }
  if (failed) process.exitCode = 1;
}

async function deploy(client: LabClient, project: LoadedProject, live: boolean): Promise<void> {
  const { manifest, files } = project;
  const gitSha = gitShortSha(project.dir);
  const { version } = await client.createVersion(manifest.slug, {
    manifest: toRuntimeManifest(manifest),
    ...(gitSha ? { gitSha } : {}),
  });
  console.log(
    `${manifest.slug}@${version}: uploading ${files.length} files (${formatBytes(totalBytes(project))})`,
  );

  let done = 0;
  const queue = [...files];
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      await withRetry(() => client.uploadFile(manifest.slug, version, f.path, f.absPath));
      done++;
      if (done % 25 === 0 || done === files.length) console.log(`  ${done}/${files.length}`);
    }
  };
  await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker));

  const info = await client.finalize(manifest.slug, version, {
    files: files.map((f) => f.path),
    live,
  });
  console.log(info.live ? `live: /lab/${manifest.slug}/` : `ready, not live`);
  console.log(`preview: /lab/${manifest.slug}/_v/${version}/`);
}

async function rollback(
  client: LabClient,
  slug: string,
  version: string | undefined,
): Promise<void> {
  let target = version;
  if (!target) {
    const { versions } = await client.listVersions(slug);
    const ready = versions.filter((v) => v.status === "ready");
    const liveIndex = ready.findIndex((v) => v.live);
    target = ready[liveIndex + 1]?.version;
    if (liveIndex < 0 || !target) throw new UsageError(`no earlier ready version of ${slug}`);
  }
  const res = await client.setLive(slug, target);
  console.log(`${res.slug} is live at ${res.liveVersion}`);
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, 300 * i));
    }
  }
}

function gitShortSha(cwd: string): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
      cwd,
      encoding: "utf8",
    }).trim();
  } catch {
    return undefined;
  }
}

const totalBytes = (p: LoadedProject) => p.files.reduce((n, f) => n + f.size, 0);

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

class UsageError extends Error {}

main(process.argv.slice(2)).catch((e: unknown) => {
  console.error(e instanceof UsageError || e instanceof ProjectError ? e.message : e);
  process.exitCode = 1;
});
