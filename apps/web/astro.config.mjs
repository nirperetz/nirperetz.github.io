import cloudflare from "@astrojs/cloudflare";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://aninir.com",
  output: "server",
  adapter: cloudflare({ imageService: "passthrough", imagesBindingName: false }),
  // No sessions: the site is stateless, so no KV namespace gets provisioned.
  session: false,
  // The edge Worker owns trailing-slash rules for /lab; site pages work either way.
  trailingSlash: "ignore",
});
