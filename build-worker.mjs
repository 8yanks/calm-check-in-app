// Post-build script: prepares dist/client/ for Cloudflare Pages deployment.
// Creates a _worker.js that:
//  1. Serves /assets/* via the CF Pages ASSETS binding (static files)
//  2. Delegates everything else to the TanStack Start SSR handler
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;

const serverAssetsDir = path.join(root, "dist/server/assets");
const clientAssetsDir = path.join(root, "dist/client/assets");
const serverEntry = path.join(root, "dist/server/index.js");
const ssrHandlerDest = path.join(root, "dist/client/ssr-handler.js");
const workerDest = path.join(root, "dist/client/_worker.js");

// 1. Copy server-side assets (worker-entry bundle) into client/assets
console.log("Copying server assets → dist/client/assets/ ...");
for (const file of fs.readdirSync(serverAssetsDir)) {
  fs.copyFileSync(path.join(serverAssetsDir, file), path.join(clientAssetsDir, file));
}

// 2. Copy dist/server/index.js as ssr-handler.js so _worker.js can import it
//    Its relative import ("./assets/worker-entry-*.js") still resolves correctly
//    from dist/client/, because we copied the server assets in step 1.
console.log("Copying SSR entry → dist/client/ssr-handler.js ...");
fs.copyFileSync(serverEntry, ssrHandlerDest);

// 3. Write a _worker.js wrapper that uses env.ASSETS for static files
const workerContent = `// Cloudflare Pages Worker entry
// Serves /assets/* (and /favicon.ico) via the CF Pages ASSETS binding,
// and delegates all other requests to the TanStack Start SSR handler.
import ssrHandler from './ssr-handler.js';

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    // Route static asset requests through CF Pages' ASSETS KV binding
    if (
      env.ASSETS &&
      (pathname.startsWith('/assets/') || pathname === '/favicon.ico')
    ) {
      try {
        const assetResponse = await env.ASSETS.fetch(request.clone());
        if (assetResponse.status !== 404) {
          return assetResponse;
        }
      } catch {
        // fall through to SSR if ASSETS lookup fails
      }
    }

    // SSR for all other paths (HTML, API routes, etc.)
    return ssrHandler.fetch(request, env, ctx);
  },
};
`;

console.log("Writing _worker.js with ASSETS wrapper → dist/client/_worker.js ...");
fs.writeFileSync(workerDest, workerContent);

console.log("✓ dist/client/ is ready for Cloudflare Pages deployment.");
