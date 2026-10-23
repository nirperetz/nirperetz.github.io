# aninir.com

A lab for experiments: 3D, shaders, games, interactive pieces and apps.
The website and API live here; each project is a folder with a `lab.json`.

- [docs/architecture.md](docs/architecture.md): how it fits together, with diagrams
- [docs/projects.md](docs/projects.md): how to add and deploy a project

## Layout

```
apps/
  edge/       Worker that owns aninir.com: routing, /lab hosting from R2, old-URL redirects
  api/        Worker with the REST API (Hono) and the D1 schema in migrations/
  web/        the website (Astro, server-rendered on a Worker)
packages/
  lab-core/   the lab.json schema, version ids, MIME types, R2 key layout
  lab-cli/    the `lab` command: validate, deploy, versions, rollback, list
projects/     the projects themselves, one folder each
scripts/      dev-seed.sh (deploy everything locally), check-legacy.sh (old-URL check)
```

## Run it locally

Needs Node 24 and pnpm.

```bash
pnpm install
```

```bash
pnpm build && pnpm dev
```

That serves the whole site at http://localhost:8787, with local D1 and R2. In a
second terminal, deploy every project into it:

```bash
./scripts/dev-seed.sh
```

The local deploy token is `dev-deploy-token` (in `apps/api/.dev.vars`) and the
local preview token is `dev-preview-token` (in `apps/edge/.dev.vars`). Neither
file is committed; create them with those lines if missing.

## Checks

```bash
pnpm check && pnpm typecheck && pnpm test
```

`pnpm fix` applies Biome's formatting and safe fixes. `.astro` files are not
typechecked yet: `astro check` doesn't support TypeScript 7.

## Going live (one time)

1. `pnpm exec wrangler login`
2. `pnpm exec wrangler r2 bucket create aninir-lab`
3. `pnpm exec wrangler d1 create aninir`, then put the printed id in
   `apps/api/wrangler.jsonc` and `apps/edge/wrangler.jsonc`.
4. Secrets: `wrangler secret put LAB_DEPLOY_TOKEN` in `apps/api`, and
   `wrangler secret put PREVIEW_TOKEN` in `apps/edge`.
5. Deploy in order: `pnpm --filter @aninir/api deploy`, then `web`, then `edge`.
6. Deploy the projects with `LAB_API=https://aninir-edge.<account>.workers.dev`
   and check them there, including `./scripts/check-legacy.sh <that origin>`.
7. Cutover: remove aninir.com and www from the Pages project, add the
   `routes` block noted in `apps/edge/wrangler.jsonc`, deploy edge, then run
   `./scripts/check-legacy.sh`.
8. GitHub secrets for CI: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and
   `LAB_DEPLOY_TOKEN`.

DNS mail records (MX, SPF) are never touched by any of this.
