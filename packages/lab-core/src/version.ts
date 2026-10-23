/**
 * Version ids sort by time as plain strings: `20261023T190400Z-ab12cd3`.
 * The suffix is the git short sha, or `local` outside git.
 */
export const VERSION = /^\d{8}T\d{6}Z-[a-z0-9]{1,12}$/;

export function createVersionId(now: Date, gitSha: string | undefined): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const suffix = gitSha && /^[0-9a-f]{4,40}$/.test(gitSha) ? gitSha.slice(0, 7) : "local";
  return `${stamp}-${suffix}`;
}

export function isVersionId(v: string): boolean {
  return VERSION.test(v);
}
