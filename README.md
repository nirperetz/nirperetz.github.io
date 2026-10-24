# aninir.com

A lab for experiments: 3D, shaders, games, interactive pieces and apps.
The website and API live here; each project is a folder with a `lab.json`.
- [docs/architecture.md](docs/architecture.md): how it fits together, with diagrams
- [docs/stack.md](docs/stack.md): every tool and service, and why it's used
- [docs/projects.md](docs/projects.md): how to add and deploy a project

## Layout

```
apps/
  edge/       Worker that owns the domain: routing, /lab hosting from R2, old-URL redirects
  api/        Worker with the REST API (Hono) and the D1 schema in migrations/
  web/        the website (Astro, server-rendered on a Worker)
packages/
  lab-core/   the lab.json schema, version ids, MIME types, R2 key layout
  lab-cli/    the `lab` command: validate, deploy, versions, rollback, list
projects/     the projects themselves, one folder each
scripts/      deploy-platform.sh, dev-seed.sh, check-legacy.sh
```

## Environments

| Branch    | URL                                                                             |
| --------- | ------------------------------------------------------------------------------- |
| `dev`     | https://dev.aninir.com                                                          |
| `staging` | https://staging.aninir.com                                                      |
| `master`  | https://aninir.com (until cutover: https://aninir-edge.nirperetz86.workers.dev) |

Pushing a branch deploys whatever changed to its environment. Each environment
has its own database, bucket and tokens. Work flows `dev → staging → master`
through pull requests. Details in [docs/stack.md](docs/stack.md#environments).

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

## Deploying by hand

CI normally does this. From a laptop:

```bash
./scripts/deploy-platform.sh staging
```

```bash
LAB_API=https://staging.aninir.com LAB_DEPLOY_TOKEN=… pnpm lab deploy projects/shader-garden
```

Tokens live outside the repo in `~/.config/aninir/tokens.env` (production) and
`tokens.staging.env` / `tokens.dev.env`.

## One-time setup

Done:
- D1 (`aninir`, `aninir-staging`, `aninir-dev`) and R2 (`aninir-lab`,
  `aninir-lab-staging`, `aninir-lab-dev`), with migrations applied.
- Worker secrets `LAB_DEPLOY_TOKEN` (api) and `PREVIEW_TOKEN` (edge) in every
  environment.
- staging.aninir.com and dev.aninir.com attached.

GitHub (repo → Settings):
- **Secrets → Actions:** `CLOUDFLARE_API_TOKEN` (Account: Workers Scripts,
  D1 and Workers R2 Storage, all Edit) and `CLOUDFLARE_ACCOUNT_ID`.
- **Environments** `production`, `staging`, `dev`. Each needs a secret
  `LAB_DEPLOY_TOKEN` (from that environment's tokens file) and a variable
  `LAB_API` (its URL, as in the table above).

## Cutover (after GitHub Pages is off)

1. Merge into master.
2. Remove aninir.com and www from the Cloudflare Pages project.
3. Add the `routes` block noted in `apps/edge/wrangler.jsonc`, then
   `./scripts/deploy-platform.sh production edge`.
4. Set the production environment's `LAB_API` to `https://aninir.com`.
5. Run `./scripts/check-legacy.sh`.

DNS mail records (MX, SPF) are never touched by any of this.
