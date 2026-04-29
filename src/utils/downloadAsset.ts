import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const R2_BUCKET = 'files';
const R2_BASE_URL = 'https://files.teacherjake.com';

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
    ['wrangler', 'r2', 'object', 'put', `${R2_BUCKET}/${r2Key}`, '--file', localPath, '--remote'],
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }
  );

  if (result.status !== 0) {
    console.error(`R2 upload failed for ${r2Key}: ${result.stderr || result.stdout}`);
    return null;
  }

  return `${R2_BASE_URL}/${r2Key}`;
}

/**
 * Ensures a PocketBase binary asset (audio, PDF) exists on R2.
 * - If already on R2, returns the R2 URL immediately (idempotent).
 * - Otherwise, fetches from PocketBase, uploads to R2, and returns the R2 URL.
 * - Falls back to the original PocketBase URL if upload fails.
 */
export async function downloadAsset(url: string, id: string, filename: string): Promise<string> {
  if (!url) return '';

  const r2Key = `pocketbase-assets/${id}/${filename}`;
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

    return uploaded ?? url; // fallback to PocketBase URL on upload failure
  } catch (err) {
    console.error(`Failed to upload asset ${url} to R2:`, err);
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    return url;
  }
}
