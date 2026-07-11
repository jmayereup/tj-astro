/**
 * freeze-ghost.mjs
 *
 * One-time (or on-demand) script that snapshots all Ghost posts
 * (with tags included) into src/data/ghost-posts.json.
 *
 * Run with:
 *   node scripts/freeze-ghost.mjs
 *
 * Requires GHOST_API_URL and GHOST_CONTENT_API_KEY in your .env file
 * (or set as environment variables).
 *
 * After running, commit src/data/ghost-posts.json to the repo.
 * The Astro build will read from this file instead of calling Ghost's API.
 */
import GhostContentAPI from '@tryghost/content-api';
import fs from 'node:fs';
import path from 'node:path';

// Load .env for local development
if (fs.existsSync('.env')) {
  process.loadEnvFile('.env');
}

const GHOST_URL = process.env.GHOST_API_URL;
const GHOST_KEY = process.env.GHOST_CONTENT_API_KEY;

if (!GHOST_URL || !GHOST_KEY) {
  console.error('Error: GHOST_API_URL and GHOST_CONTENT_API_KEY must be set.');
  process.exit(1);
}

const ghost = new GhostContentAPI({
  url: GHOST_URL,
  key: GHOST_KEY,
  version: 'v5.0',
});

console.log(`Fetching all Ghost posts from ${GHOST_URL}...`);

const posts = [];
let page = 1;
let totalPages = 1;

do {
  const response = await ghost.posts.browse({
    include: 'tags',
    limit: 100,
    page,
  });
  posts.push(...response);
  totalPages = response.meta.pagination.pages;
  console.log(`  Fetched page ${page}/${totalPages} (${response.length} posts)`);
  page++;
} while (page <= totalPages);

const outPath = path.join(process.cwd(), 'src', 'data', 'ghost-posts.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(posts, null, 2));

console.log(`\nFroze ${posts.length} posts → ${path.relative(process.cwd(), outPath)}`);
console.log('Commit src/data/ghost-posts.json to preserve the snapshot.');
