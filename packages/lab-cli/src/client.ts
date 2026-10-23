import { openAsBlob } from "node:fs";
import type {
  ApiError,
  CreateVersionRequest,
  FinalizeRequest,
  ProjectSummary,
  VersionInfo,
} from "@aninir/lab-core";

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(status: number, body: ApiError | string) {
    const msg =
      typeof body === "string"
        ? body
        : [body.error.message, ...(body.error.details ?? [])].join("\n  ");
    super(`API ${status}: ${msg}`);
    this.status = status;
  }
}

/** Thin client for the lab API. Plain fetch; shapes come from @aninir/lab-core. */
export class LabClient {
  readonly #base: string;
  readonly #token: string | undefined;

  constructor(base: string, token: string | undefined) {
    this.#base = base.replace(/\/$/, "");
    this.#token = token;
  }

  listProjects(): Promise<{ projects: ProjectSummary[] }> {
    return this.#json("GET", "/api/projects");
  }

  listVersions(slug: string): Promise<{ versions: VersionInfo[] }> {
    return this.#json("GET", `/api/projects/${slug}/versions`);
  }

  createVersion(slug: string, body: CreateVersionRequest): Promise<{ version: string }> {
    return this.#json("POST", `/api/projects/${slug}/versions`, body);
  }

  async uploadFile(slug: string, version: string, path: string, absPath: string): Promise<void> {
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    const res = await this.#fetch(
      "PUT",
      `/api/projects/${slug}/versions/${version}/files/${encoded}`,
      {
        body: await openAsBlob(absPath),
      },
    );
    await this.#check(res);
  }

  finalize(slug: string, version: string, body: FinalizeRequest): Promise<VersionInfo> {
    return this.#json("POST", `/api/projects/${slug}/versions/${version}/finalize`, body);
  }

  setLive(slug: string, version: string): Promise<{ slug: string; liveVersion: string }> {
    return this.#json("POST", `/api/projects/${slug}/live`, { version });
  }

  async #json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.#fetch(method, path, {
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    });
    await this.#check(res);
    return (await res.json()) as T;
  }

  #fetch(method: string, path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.#token) headers.set("authorization", `Bearer ${this.#token}`);
    return fetch(`${this.#base}${path}`, { ...init, method, headers });
  }

  async #check(res: Response): Promise<void> {
    if (res.ok) return;
    const text = await res.text();
    let body: ApiError | string = text;
    try {
      body = JSON.parse(text) as ApiError;
    } catch {}
    throw new ApiRequestError(res.status, body);
  }
}
