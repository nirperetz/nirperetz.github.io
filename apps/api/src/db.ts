import type { ProjectSummary, RuntimeManifest, VersionInfo, Visibility } from "@aninir/lab-core";

/** All SQL lives here. Handlers speak in domain types, never rows. */

interface ProjectRow {
  slug: string;
  title: string;
  description: string;
  kind: string;
  tags: string;
  year: number | null;
  visibility: Visibility;
  thumbnail: string | null;
  manifest: string;
  live_version: string;
  updated_at: string;
}

interface VersionRow {
  slug: string;
  version: string;
  status: "uploading" | "ready";
  manifest: string;
  git_sha: string | null;
  file_count: number;
  bytes: number;
  created_at: string;
}

export interface ProjectRecord extends ProjectSummary {
  manifest: RuntimeManifest;
}

export interface VersionRecord extends Omit<VersionInfo, "live"> {
  manifest: RuntimeManifest;
}

export interface ListFilter {
  kind?: string | undefined;
  tag?: string | undefined;
}

export class Registry {
  readonly #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  async listListed(filter: ListFilter): Promise<ProjectSummary[]> {
    const where = ["visibility = 'listed'"];
    const params: string[] = [];
    if (filter.kind) {
      where.push("kind = ?");
      params.push(filter.kind);
    }
    if (filter.tag) {
      where.push("EXISTS (SELECT 1 FROM json_each(projects.tags) WHERE value = ?)");
      params.push(filter.tag);
    }
    const { results } = await this.#db
      .prepare(
        `SELECT * FROM projects WHERE ${where.join(" AND ")}
         ORDER BY year IS NULL, year DESC, updated_at DESC`,
      )
      .bind(...params)
      .all<ProjectRow>();
    return results.map((r) => toSummary(r));
  }

  async getProject(slug: string): Promise<ProjectRecord | null> {
    const row = await this.#db
      .prepare("SELECT * FROM projects WHERE slug = ?")
      .bind(slug)
      .first<ProjectRow>();
    return row ? { ...toSummary(row), manifest: JSON.parse(row.manifest) } : null;
  }

  async listVersions(slug: string): Promise<VersionRecord[]> {
    const { results } = await this.#db
      .prepare("SELECT * FROM versions WHERE slug = ? ORDER BY version DESC")
      .bind(slug)
      .all<VersionRow>();
    return results.map(toVersion);
  }

  async getVersion(slug: string, version: string): Promise<VersionRecord | null> {
    const row = await this.#db
      .prepare("SELECT * FROM versions WHERE slug = ? AND version = ?")
      .bind(slug, version)
      .first<VersionRow>();
    return row ? toVersion(row) : null;
  }

  /** Returns false when the version id is already taken. */
  async createVersion(
    slug: string,
    version: string,
    manifest: RuntimeManifest,
    gitSha: string | null,
  ): Promise<boolean> {
    const res = await this.#db
      .prepare(
        `INSERT INTO versions (slug, version, status, manifest, git_sha)
         VALUES (?, ?, 'uploading', ?, ?) ON CONFLICT DO NOTHING`,
      )
      .bind(slug, version, JSON.stringify(manifest), gitSha)
      .run();
    return res.meta.changes === 1;
  }

  async markReady(slug: string, version: string, fileCount: number, bytes: number): Promise<void> {
    await this.#db
      .prepare(
        `UPDATE versions SET status = 'ready', file_count = ?, bytes = ?
         WHERE slug = ? AND version = ?`,
      )
      .bind(fileCount, bytes, slug, version)
      .run();
  }

  /** Point the project at a ready version. Listing metadata follows that version's manifest. */
  async promote(v: VersionRecord): Promise<void> {
    const m = v.manifest;
    await this.#db
      .prepare(
        `INSERT INTO projects
           (slug, title, description, kind, tags, year, visibility, thumbnail, manifest, live_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (slug) DO UPDATE SET
           title = excluded.title, description = excluded.description, kind = excluded.kind,
           tags = excluded.tags, year = excluded.year, visibility = excluded.visibility,
           thumbnail = excluded.thumbnail, manifest = excluded.manifest,
           live_version = excluded.live_version,
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`,
      )
      .bind(
        v.slug,
        m.title,
        m.description,
        m.kind,
        JSON.stringify(m.tags),
        m.year ?? null,
        m.visibility,
        m.thumbnail ?? null,
        JSON.stringify(m),
        v.version,
      )
      .run();
  }
}

function toSummary(r: ProjectRow): ProjectSummary {
  return {
    slug: r.slug,
    title: r.title,
    description: r.description,
    kind: r.kind,
    tags: JSON.parse(r.tags),
    year: r.year,
    visibility: r.visibility,
    url: `/lab/${r.slug}/`,
    thumbnailUrl: r.thumbnail ? `/lab/${r.slug}/${r.thumbnail}` : null,
    liveVersion: r.live_version,
    updatedAt: r.updated_at,
  };
}

function toVersion(r: VersionRow): VersionRecord {
  return {
    slug: r.slug,
    version: r.version,
    status: r.status,
    gitSha: r.git_sha,
    fileCount: r.file_count,
    bytes: r.bytes,
    createdAt: r.created_at,
    manifest: JSON.parse(r.manifest),
  };
}
