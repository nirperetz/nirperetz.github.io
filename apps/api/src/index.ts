import {
  contentTypeFor,
  createVersionId,
  formatIssues,
  type IssueList,
  isSafeRelativePath,
  isVersionId,
  LabManifest,
  type ProjectSummary,
  r2Key,
  toRuntimeManifest,
  type VersionInfo,
} from "@aninir/lab-core";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { readAuth, requireAuth } from "./auth.ts";
import { Registry, type VersionRecord } from "./db.ts";
import type { AppEnv } from "./env.ts";
import { badRequest, conflict, notFound, renderError } from "./errors.ts";

const SlugParam = z.object({ slug: LabManifest.shape.slug });
const VersionParam = SlugParam.extend({
  version: z.string().refine(isVersionId, "bad version id"),
});

const CreateVersionBody = z.object({
  manifest: LabManifest,
  gitSha: z.string().max(40).optional(),
});
const FinalizeBody = z.object({
  files: z.array(z.string()).min(1),
  live: z.boolean().default(true),
});
const SetLiveBody = z.object({ version: z.string().refine(isVersionId, "bad version id") });
const ListQuery = z.object({ kind: z.string().optional(), tag: z.string().optional() });

/** Validation failures use the same `{ error }` shape as everything else. */
const hook = (result: { success: boolean; error?: IssueList }) => {
  if (!result.success && result.error)
    throw badRequest("invalid request", formatIssues(result.error));
};

const app = new Hono<AppEnv>()
  .basePath("/api")
  .use(readAuth)
  .onError(renderError)
  .notFound((c) => c.json({ error: { code: "not_found", message: "no such endpoint" } }, 404))

  .get("/health", (c) => c.json({ ok: true }))

  .get("/projects", zValidator("query", ListQuery, hook), async (c) => {
    const projects = await new Registry(c.env.DB).listListed(c.req.valid("query"));
    c.header("cache-control", "public, max-age=30");
    return c.json({ projects });
  })

  .get("/projects/:slug", zValidator("param", SlugParam, hook), async (c) => {
    const { slug } = c.req.valid("param");
    const project = await new Registry(c.env.DB).getProject(slug);
    if (!project || (project.visibility === "draft" && !c.get("authed"))) throw notFound("project");
    const { manifest: _m, ...summary } = project;
    return c.json<ProjectSummary>(summary);
  })

  .get("/projects/:slug/versions", requireAuth, zValidator("param", SlugParam, hook), async (c) => {
    const { slug } = c.req.valid("param");
    const registry = new Registry(c.env.DB);
    const [versions, project] = await Promise.all([
      registry.listVersions(slug),
      registry.getProject(slug),
    ]);
    return c.json({ versions: versions.map((v) => toInfo(v, project?.liveVersion)) });
  })

  .post(
    "/projects/:slug/versions",
    requireAuth,
    zValidator("param", SlugParam, hook),
    zValidator("json", CreateVersionBody, hook),
    async (c) => {
      const { slug } = c.req.valid("param");
      const { manifest, gitSha } = c.req.valid("json");
      if (manifest.slug !== slug) throw badRequest(`manifest slug "${manifest.slug}" ≠ "${slug}"`);
      const version = createVersionId(new Date(), gitSha);
      const created = await new Registry(c.env.DB).createVersion(
        slug,
        version,
        toRuntimeManifest(manifest),
        gitSha ?? null,
      );
      if (!created) throw conflict(`version ${version} already exists, retry in a second`);
      return c.json({ version }, 201);
    },
  )

  .put(
    "/projects/:slug/versions/:version/files/*",
    requireAuth,
    zValidator("param", VersionParam, hook),
    async (c) => {
      const { slug, version } = c.req.valid("param");
      const prefix = `/api/projects/${slug}/versions/${version}/files/`;
      const path = decodePath(c.req.path.slice(prefix.length));
      if (!path || !isSafeRelativePath(path)) throw badRequest("invalid file path");

      const v = await new Registry(c.env.DB).getVersion(slug, version);
      if (!v) throw notFound("version");
      if (v.status !== "uploading") throw conflict("version is finalized and immutable");
      if (!c.req.raw.body) throw badRequest("empty body");

      await c.env.LAB_BUCKET.put(r2Key.file(slug, version, path), c.req.raw.body, {
        httpMetadata: { contentType: contentTypeFor(path) },
      });
      return c.body(null, 204);
    },
  )

  .post(
    "/projects/:slug/versions/:version/finalize",
    requireAuth,
    zValidator("param", VersionParam, hook),
    zValidator("json", FinalizeBody, hook),
    async (c) => {
      const { slug, version } = c.req.valid("param");
      const { files, live } = c.req.valid("json");
      const registry = new Registry(c.env.DB);
      const v = await registry.getVersion(slug, version);
      if (!v) throw notFound("version");
      if (v.status !== "uploading") throw conflict("version is already finalized");

      const stored = await listStored(c.env.LAB_BUCKET, r2Key.versionPrefix(slug, version));
      const missing = files.filter((f) => !stored.has(f));
      if (missing.length)
        throw badRequest(`${missing.length} files never arrived`, missing.slice(0, 20));
      if (!stored.has(v.manifest.entry)) throw badRequest(`entry "${v.manifest.entry}" missing`);

      const bytes = [...stored.values()].reduce((n, size) => n + size, 0);
      await registry.markReady(slug, version, stored.size, bytes);
      const ready: VersionRecord = { ...v, status: "ready", fileCount: stored.size, bytes };
      if (live) await registry.promote(ready);
      return c.json(toInfo(ready, live ? version : undefined));
    },
  )

  .post(
    "/projects/:slug/live",
    requireAuth,
    zValidator("param", SlugParam, hook),
    zValidator("json", SetLiveBody, hook),
    async (c) => {
      const { slug } = c.req.valid("param");
      const { version } = c.req.valid("json");
      const registry = new Registry(c.env.DB);
      const v = await registry.getVersion(slug, version);
      if (!v) throw notFound("version");
      if (v.status !== "ready") throw conflict("version is still uploading");
      await registry.promote(v);
      return c.json({ slug, liveVersion: version });
    },
  );

export type AppType = typeof app;
export default app;

function toInfo(v: VersionRecord, liveVersion: string | undefined): VersionInfo {
  const { manifest: _m, ...rest } = v;
  return { ...rest, live: v.version === liveVersion };
}

function decodePath(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/** Map of path → size for everything stored under a version prefix. */
async function listStored(bucket: R2Bucket, prefix: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, ...(cursor ? { cursor } : {}) });
    for (const o of page.objects) out.set(o.key.slice(prefix.length), o.size);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out;
}
