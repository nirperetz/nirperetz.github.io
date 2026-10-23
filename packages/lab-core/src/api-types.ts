import type { RuntimeManifest, Visibility } from "./manifest.ts";

/** Shapes the API returns. Shared so the CLI and the website agree with the server. */

export interface ProjectSummary {
  slug: string;
  title: string;
  description: string;
  kind: string;
  tags: string[];
  year: number | null;
  visibility: Visibility;
  url: string;
  thumbnailUrl: string | null;
  liveVersion: string;
  updatedAt: string;
}

export interface VersionInfo {
  slug: string;
  version: string;
  status: "uploading" | "ready";
  gitSha: string | null;
  fileCount: number;
  bytes: number;
  createdAt: string;
  live: boolean;
}

export interface CreateVersionRequest {
  manifest: RuntimeManifest;
  gitSha?: string;
}

export interface FinalizeRequest {
  files: string[];
  /** Make this version live (default true). */
  live?: boolean;
}

export interface ApiError {
  error: { code: string; message: string; details?: string[] };
}
