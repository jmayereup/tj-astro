/**
 * One-time script to upload all existing public/ghost-assets and public/pocketbase-assets
 * to Cloudflare R2 (bucket: files, domain: files.teacherjake.com).
 *
 * Prerequisites:
 *   - wrangler authenticated: npx wrangler login
 *   - OR set CLOUDFLARE_API_TOKEN env var
 *
 * Usage:
 *   node scripts/upload-to-r2.mjs
 *   node scripts/upload-to-r2.mjs --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const R2_BUCKET = 'files';
const R2_BASE_URL = 'https://files.teacherjake.com';

// Only non-image binary files go to R2 public/. Images are in src/assets and handled by Astro.
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg', '.ico']);
const SOURCE_DIRS = ['public/ghost-assets', 'public/pocketbase-assets'];

const isDryRun = process.argv.includes('--dry-run');

if (isDryRun) {
  console.log('🔍 DRY RUN — no files will be uploaded\n');
}

/**
 * Recursively walks a directory and returns all file paths.
 */
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Uploads a single file to R2 using wrangler CLI.
 * Returns true on success.
 */
function uploadToR2(localPath, r2Key) {
  if (isDryRun) {
    console.log(`  → ${R2_BASE_URL}/${r2Key}`);
    return true;
  }

  const result = spawnSync(
    'npx',
    ['wrangler', 'r2', 'object', 'put', `${R2_BUCKET}/${r2Key}`, '--file', localPath, '--remote'],
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }
  );

  if (result.status !== 0) {
    console.error(`  ❌ Failed: ${result.stderr || result.stdout}`);
    return false;
  }
  return true;
}

let uploaded = 0;
let skipped = 0;
let failed = 0;

for (const sourceDir of SOURCE_DIRS) {
  if (!fs.existsSync(sourceDir)) {
    console.warn(`⚠️  Directory not found, skipping: ${sourceDir}`);
    continue;
  }

  console.log(`\n📂 Processing ${sourceDir}/`);
  const files = walk(sourceDir);

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();

    if (IMAGE_EXTS.has(ext)) {
      console.log(`  ⏭  Skipping image: ${filePath}`);
      skipped++;
      continue;
    }

    // R2 key = path relative to cwd, without the leading public/
    // e.g. public/ghost-assets/english-stories-a1/brave-cow.mp3
    //   →  ghost-assets/english-stories-a1/brave-cow.mp3
    const r2Key = filePath.replace(/^public\//, '');

    console.log(`  ⬆  ${filePath}`);
    const ok = uploadToR2(filePath, r2Key);
    if (ok) {
      uploaded++;
    } else {
      failed++;
    }
  }
}

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Uploaded:       ${uploaded}
⏭  Skipped (img): ${skipped}
❌ Failed:         ${failed}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${isDryRun ? '(dry run — nothing was actually uploaded)' : `Files available at: ${R2_BASE_URL}`}
`);

if (failed > 0) process.exit(1);
