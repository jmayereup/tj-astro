/**
 * Ghost CMS client — no longer used by the Astro build.
 *
 * Ghost content is now frozen in src/data/ghost-posts.json.
 * This client is retained only for on-demand scripts (e.g. scripts/freeze-ghost.mjs).
 *
 * ----- If you shut down Ghost permanently -----
 * 1. Run `node scripts/freeze-ghost.mjs` one final time and commit the JSON.
 * 2. Delete this file (src/lib/ghost.ts).
 * 3. Uninstall the Ghost SDK: `npm uninstall @tryghost/content-api`
 * 4. Remove GHOST_API_URL and GHOST_CONTENT_API_KEY from all CI/CD environments
 *    (Cloudflare Pages, etc.) — they are no longer needed at build time.
 * 5. Remove or archive scripts/freeze-ghost.mjs (no longer applicable).
 * 6. Update download-assets.mjs to skip the syncGhostAssets() call
 *    (or remove it entirely if Ghost assets are already fully committed).
 */
import GhostContentAPI from '@tryghost/content-api';
import { GHOST_API_URL, GHOST_CONTENT_API_KEY } from './env';

// Guard against missing credentials so dev builds without .env don't throw.
export const ghostClient =
  GHOST_API_URL && GHOST_CONTENT_API_KEY
    ? new GhostContentAPI({
        url: GHOST_API_URL,
        key: GHOST_CONTENT_API_KEY,
        version: 'v5.0',
      })
    : null;
