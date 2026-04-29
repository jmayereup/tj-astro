import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Load .env file for local development if it exists
if (fs.existsSync('.env')) {
  process.loadEnvFile('.env');
}

// Environment variables
const GHOST_URL = process.env.GHOST_API_URL || '';
const GHOST_KEY = process.env.GHOST_CONTENT_API_KEY || '';
const PB_URL = process.env.PUBLIC_POCKETBASE_URL || 'https://blog.teacherjake.com';

const SRC_ASSETS_DIR = path.join(process.cwd(), 'src', 'assets');

const R2_BUCKET = 'files';
const R2_BASE_URL = 'https://files.teacherjake.com';

// Helper to determine if a file is an image (handled by Astro, saved to src/assets)
const isImage = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'].includes(ext);
};

/**
 * Checks whether a file already exists on R2 by doing a HEAD request.
 * Returns true if the file is there (HTTP 200 or 304).
 */
async function existsOnR2(r2Url) {
  try {
    const res = await fetch(r2Url, { method: 'HEAD' });
    return res.ok;
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

    if (fs.existsSync(destPath)) return destPath;

    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    try {
      const res = await fetch(url);
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
      console.log(`Already on R2: ${r2Key}`);
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

// 1. Ghost Asset Discovery
async function syncGhostAssets() {
  if (!GHOST_URL || !GHOST_KEY) return console.warn('Ghost credentials missing, skipping sync.');

  console.log('Syncing Ghost assets...');
  let page = 1;
  let totalPages = 1;
  let totalPosts = 0;

  try {
    do {
      const browseUrl = `${GHOST_URL}/ghost/api/content/posts/?key=${GHOST_KEY}&include=tags&limit=100&page=${page}`;
      const res = await fetch(browseUrl);
      const data = await res.json();
      const posts = data.posts || [];
      totalPages = data.meta.pagination.pages;
      totalPosts += posts.length;

      console.log(`Syncing Ghost assets (page ${page}/${totalPages})...`);

      for (const post of posts) {
        try {
          if (post.feature_image) {
            const filename = getFilenameFromUrl(post.feature_image, post.slug);
            await downloadFile(post.feature_image, post.slug, filename, 'ghost-assets');
          }

          if (post.html) {
            const assetRegex = /(src|data-thumbnail|href)="([^">]+)"/g;
            let match;
            while ((match = assetRegex.exec(post.html)) !== null) {
              const attr = match[1];
              let url = match[2];

              if (url) {
                if (attr === 'href' && !['/content/media/', '/content/images/', '/content/files/'].some(p => url.includes(p))) continue;
                if (attr === 'src' && !url.includes('/content/')) continue;
                if (url.endsWith('.js') || url.includes('/scripts/')) continue;
                if (url.includes('youtube.com/') || url.includes('youtu.be/')) continue;

                if (url.startsWith('/')) url = `${GHOST_URL}${url}`;
                if (url.startsWith('http')) {
                  const filename = getFilenameFromUrl(url, post.slug);
                  await downloadFile(url, post.slug, filename, 'ghost-assets');
                }
              }
            }
          }
        } catch (postErr) {
          console.error(`Failed to sync assets for Ghost post ${post.slug}:`, postErr.message);
        }
      }
      page++;
    } while (page <= totalPages);

    console.log(`Total Ghost posts processed: ${totalPosts}`);
  } catch (err) {
    console.error('Ghost sync failed:', err);
  }
}

// 2. PocketBase Asset Discovery
// PocketBase is configured to use R2 as its storage backend.
// Non-image files (audio, PDF) are stored by PocketBase directly at:
//   {collectionId}/{recordId}/{filename}
// Images still need to be downloaded to src/assets/ for Astro optimisation.
async function syncPbAssets() {
  console.log('Syncing PocketBase assets...');
  const browseUrl = `${PB_URL}/api/collections/worksheets/records?perPage=500`;

  try {
    const res = await fetch(browseUrl);
    const data = await res.json();
    const records = data.items || [];

    for (const record of records) {
      // Images → download to src/assets/ for Astro <Image /> optimisation
      if (record.image) {
        const url = `${PB_URL}/api/files/${record.collectionId}/${record.id}/${record.image}`;
        await downloadFile(url, record.id, record.image, 'pocketbase-assets');
      }

      // Audio → PocketBase writes directly to R2 at {collectionId}/{recordId}/{filename}
      // Just verify it exists there; upload from PocketBase API as fallback.
      if (record.audioFile) {
        const url = `${PB_URL}/api/files/${record.collectionId}/${record.id}/${record.audioFile}`;
        const r2Key = `${record.collectionId}/${record.id}/${record.audioFile}`;
        await downloadFile(url, record.id, record.audioFile, 'pocketbase-assets', r2Key);
      }

      // Scan content JSON for any other embedded PB file references
      const contentStr = typeof record.content === 'string' ? record.content : JSON.stringify(record.content);
      const pbFileRegex = /\/api\/files\/([^\/]+)\/([^\/]+)\/([^\s"'><\?\n]+)/g;
      let match;
      while ((match = pbFileRegex.exec(contentStr)) !== null) {
        const [fullMatch, collId, recId, filename] = match;
        const cleanFilename = filename.split('?')[0];
        const url = `${PB_URL}${fullMatch.split('?')[0]}`;
        const r2Key = isImage(cleanFilename) ? null : `${collId}/${recId}/${cleanFilename}`;
        await downloadFile(url, recId, cleanFilename, 'pocketbase-assets', r2Key);
      }
    }
  } catch (err) {
    console.error('PocketBase sync failed:', err);
  }
}

// Cleanup temp dir if it exists from a previous run
const tmpDir = path.join(process.cwd(), '.r2-tmp');
if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });

// Main execution
(async () => {
  await syncGhostAssets();
  await syncPbAssets();

  // Clean up temp dir
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });

  console.log('Asset sync complete.');
})();
