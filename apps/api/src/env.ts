export interface Env {
  DB: D1Database;
  LAB_BUCKET: R2Bucket;
  LAB_DEPLOY_TOKEN: string;
}

export interface AppEnv {
  Bindings: Env;
  Variables: { authed: boolean };
}
