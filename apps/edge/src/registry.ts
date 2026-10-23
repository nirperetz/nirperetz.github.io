import type { RuntimeManifest } from "@aninir/lab-core";

export interface Resolved {
  version: string;
  manifest: RuntimeManifest;
}

const LIVE_TTL_MS = 30_000;
const PINNED_TTL_MS = 10 * 60_000;

/**
 * Read-only view of the registry the API writes. Results are cached per isolate:
 * live pointers briefly (a rollback shows within 30 s), finalized versions longer,
 * since they never change.
 */
export class LabRegistry {
  static readonly #cache = new Map<string, { value: Resolved | null; expires: number }>();
  readonly #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  live(slug: string): Promise<Resolved | null> {
    return this.#cached(`live:${slug}`, LIVE_TTL_MS, async () => {
      const row = await this.#db
        .prepare("SELECT live_version, manifest FROM projects WHERE slug = ?")
        .bind(slug)
        .first<{ live_version: string; manifest: string }>();
      return row ? { version: row.live_version, manifest: JSON.parse(row.manifest) } : null;
    });
  }

  pinned(slug: string, version: string): Promise<Resolved | null> {
    return this.#cached(`v:${slug}:${version}`, PINNED_TTL_MS, async () => {
      const row = await this.#db
        .prepare(
          "SELECT manifest FROM versions WHERE slug = ? AND version = ? AND status = 'ready'",
        )
        .bind(slug, version)
        .first<{ manifest: string }>();
      return row ? { version, manifest: JSON.parse(row.manifest) } : null;
    });
  }

  async #cached(key: string, ttl: number, load: () => Promise<Resolved | null>) {
    const hit = LabRegistry.#cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    const value = await load();
    // Misses are cached briefly too, so a burst of 404s doesn't hammer D1.
    LabRegistry.#cache.set(key, { value, expires: Date.now() + (value ? ttl : 5_000) });
    return value;
  }
}
