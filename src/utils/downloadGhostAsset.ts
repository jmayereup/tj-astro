import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const R2_BUCKET = 'files';
const R2_BASE_URL = 'https://files.teacherjake.com';

// Helper to determine extension from a Ghost URL
function getFilenameFromUrl(url: string, id: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const parts = pathname.split('/');
    let filename = parts[parts.length - 1];
    if (!filename || !filename.includes('.')) {
      if (pathname.includes('/media/') || pathname.includes('audio')) {
        filename = `${id}.mp3`;
      } else if (pathname.includes('/files/')) {
        filename = `${id}.pdf`;
      } else {
        filename = `${id}.jpg`;
      }
    }
    return filename;
  } catch {
    return `${id}.jpg`;
  }
}

/**
 * Checks whether a file already exists on R2 by doing a HEAD request.
 */
async function existsOnR2(r2Url: string): Promise<boolean> {
  try {
    const res = await fetch(r2Url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Uploads a local file to R2 via wrangler CLI. Returns the R2 URL on success.
 */
function uploadToR2(localPath: string, r2Key: string): string | null {
  const result = spawnSync(
    'npx',
    ['wrangler', 'r2', 'object', 'put', `${R2_BUCKET}/${r2Key}`, '--file', localPath],
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }
  );

  if (result.status !== 0) {
    console.error(`R2 upload failed for ${r2Key}: ${result.stderr || result.stdout}`);
    return null;
  }

  return `${R2_BASE_URL}/${r2Key}`;
}

/**
 * Ensures a single Ghost binary asset exists on R2.
 * - If already on R2, returns the R2 URL immediately (idempotent).
 * - Otherwise, fetches from Ghost, uploads to R2, returns the R2 URL.
 * - Returns empty string on failure (triggers fallback UI in callers).
 */
export async function downloadGhostAsset(url: string, id: string): Promise<string> {
  if (!url) return '';

  const filename = getFilenameFromUrl(url, id);
  const r2Key = `ghost-assets/${id}/${filename}`;
  const r2Url = `${R2_BASE_URL}/${r2Key}`;

  if (await existsOnR2(r2Url)) {
    return r2Url;
  }

  const tmpDir = path.join(process.cwd(), '.r2-tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, filename);

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(tmpFile, Buffer.from(buffer));

    const uploaded = uploadToR2(tmpFile, r2Key);
    fs.unlinkSync(tmpFile);

    return uploaded ?? ''; // empty string triggers fallback UI in callers
  } catch (err) {
    console.error(`Failed to upload Ghost asset ${url} to R2:`, err);
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    return '';
  }
}

/**
 * Replaces all asset URLs in a Ghost HTML string with their R2-hosted equivalents.
 * Images are excluded (handled separately by contentTransformer via src/assets).
 */
export async function downloadGhostHtmlAssets(html: string, postId: string, ghostUrl: string = ''): Promise<string> {
  if (!html) return '';

  const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'];

  const assetRegex = /(src|data-thumbnail|href)="([^">]+)"/g;
  let match;
  let newHtml = html;

  const urlsToProcess = new Set<string>();

  while ((match = assetRegex.exec(html)) !== null) {
    const attr = match[1];
    let url = match[2];

    if (url) {
      if (attr === 'href') {
        if (!url.includes('/content/media/') &&
            !url.includes('/content/images/') &&
            !url.includes('/content/files/')) {
          continue;
        }
      }

      if (url.endsWith('.js') || url.includes('/scripts/')) continue;
      if (url.includes('youtube.com/') || url.includes('youtu.be/')) continue;

      // Skip images — they are handled by contentTransformer via src/assets
      const ext = url.split('?')[0].toLowerCase().split('.').pop();
      if (ext && IMAGE_EXTS.some(e => e === `.${ext}`)) continue;

      // Skip already-resolved R2 URLs
      if (url.startsWith(R2_BASE_URL)) continue;

      if (url.startsWith('/')) {
        url = `${ghostUrl}${url}`;
      }

      if (url.startsWith('http')) {
        urlsToProcess.add(url);
      }
    }
  }

  for (const originalUrl of urlsToProcess) {
    const r2Url = await downloadGhostAsset(originalUrl, postId);
    if (r2Url && r2Url !== originalUrl) {
      let relativeOriginal = originalUrl;
      if (ghostUrl && originalUrl.startsWith(ghostUrl)) {
        relativeOriginal = originalUrl.substring(ghostUrl.length);
      }

      newHtml = newHtml.split(originalUrl).join(r2Url);
      newHtml = newHtml.split(relativeOriginal).join(r2Url);
    }
  }

  return newHtml;
}
