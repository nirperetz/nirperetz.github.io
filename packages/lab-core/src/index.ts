export type * from "./api-types.ts";
export * from "./manifest.ts";
export * from "./mime.ts";
export * from "./version.ts";

/** R2 key layout. One place, so the API (writer) and edge (reader) can't drift. */
export const r2Key = {
  file: (slug: string, version: string, path: string) => `lab/${slug}/${version}/${path}`,
  versionPrefix: (slug: string, version: string) => `lab/${slug}/${version}/`,
  asset: (path: string) => `assets/${path}`,
};
