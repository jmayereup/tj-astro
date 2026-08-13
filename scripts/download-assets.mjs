/**
 * download-assets.mjs
 *
 * Syncs media assets to local src/assets/ (images) and Cloudflare R2 (audio/files).
 *
 * Ghost section: Ghost content is now frozen (src/data/ghost-posts.json).
 * All Ghost images are already committed to src/assets/ghost-assets/ and all
 * Ghost audio/files are already on R2. The syncGhostAssets() call below is a
 * fast no-op on every normal build (it checks before downloading).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import PocketBase from 'pocketbase';

// Load .env file for local development if it exists
if (fs.existsSync('.env')) {
  process.loadEnvFile('.env');
}

// Environment variables
const GHOST_URL = process.env.GHOST_API_URL || '';
const GHOST_KEY = process.env.GHOST_CONTENT_API_KEY || '';
const PB_URL = process.env.PUBLIC_POCKETBASE_URL || 'https://pb.teacherjake.com';

const SRC_ASSETS_DIR = path.join(process.cwd(), 'src', 'assets');

const R2_BUCKET = 'files';
const R2_BASE_URL = 'https://files.teacherjake.com';
const CONCURRENCY_LIMIT = 15;

/**
 * Concurrency helper for running tasks in parallel with a max limit.
 */
async function mapConcurrent(items, limit, fn) {
  const results = [];
  const executing = new Set();
  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    results.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean, clean);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

// Helper to determine if a file is an image (handled by Astro, saved to src/assets)
const isImage = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg', '.ico'].includes(ext);
};

const r2Cache = new Set();

/**
 * Checks whether a file already exists on R2 by doing a HEAD request.
 * Returns true if the file is there (HTTP 200 or 304).
 */
async function existsOnR2(r2Url) {
  if (r2Cache.has(r2Url)) return true;
  try {
    const res = await fetch(r2Url, { method: 'HEAD' });
    if (res.ok) {
      r2Cache.add(r2Url);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Uploads a local file to R2 via wrangler CLI.
 * Returns the public R2 URL on success, or null on failure.
 */
function uploadToR2(localPath, r2Key) {
  const result = spawnSync(
    'npx',
    ['wrangler', 'r2', 'object', 'put', `${R2_BUCKET}/${r2Key}`, '--file', localPath, '--remote'],
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }
  );

  if (result.status !== 0) {
    console.error(`  R2 upload failed for ${r2Key}: ${result.stderr || result.stdout}`);
    return null;
  }

  return `${R2_BASE_URL}/${r2Key}`;
}

/**
 * Downloads a file and:
 *  - If it's an image → saves to src/assets/ for Astro optimisation
 *  - If it's a non-image → verifies/uploads to R2, no local copy kept
 *
 * r2KeyOverride: optional explicit R2 key (used for PocketBase assets where
 * PocketBase writes directly to R2 using its own collectionId-based path).
 *
 * Returns the public URL for the file (R2 URL or src/assets path).
 */
async function downloadFile(url, id, filename, subDir, r2KeyOverride = null) {
  const isImg = isImage(filename);

  if (isImg) {
    // Images: save to src/assets for Astro's <Image /> optimisation
    const destPath = path.join(SRC_ASSETS_DIR, subDir, id, filename);
    const missingMarker = `${destPath}.404`;

    if (fs.existsSync(destPath) || fs.existsSync(missingMarker)) return destPath;

    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    try {
      const res = await fetch(url);
      if (res.status === 404) {
        fs.writeFileSync(missingMarker, '');
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) {
        console.warn(`Skipping ${url}: expected image, got "${contentType}"`);
        return null;
      }

      const buffer = await res.arrayBuffer();
      fs.writeFileSync(destPath, Buffer.from(buffer));
      console.log(`Downloaded IMAGE: ${path.relative(process.cwd(), destPath)}`);
      return destPath;
    } catch (err) {
      console.error(`Failed to download image ${url}:`, err.message);
      return null;
    }

  } else {
    // Non-images (MP3, WAV, PDF, etc.): verify/upload to R2
    const r2Key = r2KeyOverride ?? `${subDir}/${id}/${filename}`;
    const r2Url = `${R2_BASE_URL}/${r2Key}`;

    // Skip if already on R2 (PocketBase writes here directly, or previously uploaded)
    if (await existsOnR2(r2Url)) {
      return r2Url;
    }

    // Not on R2 yet — download and upload (fallback for Ghost assets or missing PB files)
    const tmpDir = path.join(process.cwd(), '.r2-tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, filename);

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = await res.arrayBuffer();
      fs.writeFileSync(tmpFile, Buffer.from(buffer));

      const uploadedUrl = uploadToR2(tmpFile, r2Key);
      fs.unlinkSync(tmpFile);

      if (uploadedUrl) {
        console.log(`Uploaded to R2: ${r2Key}`);
        return uploadedUrl;
      }
      return url; // fallback to origin
    } catch (err) {
      console.error(`Failed to upload ${url} to R2:`, err.message);
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      return url;
    }
  }
}

function getFilenameFromUrl(url, id) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    let filename = path.basename(pathname);

    if (!filename || !filename.includes('.')) {
      if (pathname.includes('/media/') || pathname.includes('audio')) {
        filename = `${filename || id}.mp3`;
      } else if (pathname.includes('/files/')) {
        filename = `${filename || id}.pdf`;
      } else {
        const fm = urlObj.searchParams.get('fm');
        const ext = fm ? `.${fm}` : '.jpg';
        filename = `${filename || id}${ext}`;
      }
    }
    return filename;
  } catch {
    return `${id}.jpg`;
  }
}

// 1. Ghost Asset Discovery (Disabled - Ghost is decommissioned and content is frozen)
async function syncGhostAssets() {
  // Ghost CMS has been decommissioned and content is frozen in src/data/ghost-posts.json.
  // All Ghost assets are committed to src/assets/ghost-assets/ or saved on R2.
  return;
}

// 2. PocketBase Asset Discovery
async function syncPbAssets() {
  console.log('Syncing PocketBase assets...');
  
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);

  try {
    const rawRecords = await pb.collection('worksheets').getFullList({
      requestKey: null,
      filter: 'notForBlog != true',
    });
    const records = rawRecords.filter(r => !r.notForBlog);

    console.log(`Processing ${records.length} PocketBase worksheet records with concurrency ${CONCURRENCY_LIMIT}...`);

    await mapConcurrent(records, CONCURRENCY_LIMIT, async (record) => {
      const tasks = [];

      // Images → download to src/assets/ for Astro <Image /> optimisation
      if (record.image) {
        const url = `${R2_BASE_URL}/${record.collectionId}/${record.id}/${record.image}`;
        tasks.push(downloadFile(url, record.id, record.image, 'pocketbase-assets'));
      }

      // Audio → PocketBase writes directly to R2 at {collectionId}/{recordId}/{filename}
      if (record.audioFile) {
        const url = `${R2_BASE_URL}/${record.collectionId}/${record.id}/${record.audioFile}`;
        const r2Key = `${record.collectionId}/${record.id}/${record.audioFile}`;
        tasks.push(downloadFile(url, record.id, record.audioFile, 'pocketbase-assets', r2Key));
      }

      // Scan content JSON for any other embedded PB file references
      const contentStr = typeof record.content === 'string' ? record.content : JSON.stringify(record.content);
      const pbFileRegex = /\/api\/files\/([^\/]+)\/([^\/]+)\/([^\s"'><\?\n]+)/g;
      let match;
      while ((match = pbFileRegex.exec(contentStr)) !== null) {
        const [fullMatch, collId, recId, filename] = match;
        const cleanFilename = filename.split('?')[0];
        const url = `${R2_BASE_URL}/${collId}/${recId}/${cleanFilename}`;
        const r2Key = isImage(cleanFilename) ? null : `${collId}/${recId}/${cleanFilename}`;
        tasks.push(downloadFile(url, recId, cleanFilename, 'pocketbase-assets', r2Key));
      }

      if (tasks.length > 0) {
        await Promise.all(tasks);
      }
    });
  } catch (err) {
    console.error('PocketBase sync failed:', err);
  }
}

// Cleanup temp dir if it exists from a previous run
const tmpDir = path.join(process.cwd(), '.r2-tmp');
if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });

// Main execution
(async () => {
  const startTime = Date.now();
  await syncGhostAssets();
  await syncPbAssets();

  // Clean up temp dir
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Asset sync complete in ${durationSec}s.`);
})();
