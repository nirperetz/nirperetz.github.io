const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json",
  map: "application/json",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  ktx2: "image/ktx2",
  hdr: "image/vnd.radiance",
  exr: "image/x-exr",
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  obj: "text/plain; charset=utf-8",
  bin: "application/octet-stream",
  wasm: "application/wasm",
  glsl: "text/plain; charset=utf-8",
  vert: "text/plain; charset=utf-8",
  frag: "text/plain; charset=utf-8",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  mp4: "video/mp4",
  webm: "video/webm",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  pdf: "application/pdf",
};

export function contentTypeFor(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return TYPES[ext] ?? "application/octet-stream";
}

export function isHtml(path: string): boolean {
  return /\.html?$/i.test(path);
}
