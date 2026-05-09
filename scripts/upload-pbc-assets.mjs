import fs from 'node:fs';
import path from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import mime from 'mime-types';

// Load environment variables from .env
dotenv.config();

const {
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  CLOUDFLARE_ACCOUNT_ID,
  R2_BUCKET_NAME = 'files',
} = process.env;

if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !CLOUDFLARE_ACCOUNT_ID) {
  console.error('❌ Missing S3 credentials or CLOUDFLARE_ACCOUNT_ID in .env');
  process.exit(1);
}

// S3 endpoint must use the cloudflarestorage.com URL, not the custom domain
const endpoint = `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;

const s3 = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const isExecute = process.argv.includes('--execute');
const isDryRun = !isExecute;

const SOURCE_DIR = '/home/jmayer/Dev/pb-worksheets-local-files/pbc_167696365';

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
 * Uploads a single file to R2 using S3 API.
 */
async function uploadToR2(localPath, r2Key) {
  if (isDryRun) return true;

  const contentType = mime.lookup(localPath) || 'application/octet-stream';
  const fileBuffer = fs.readFileSync(localPath);

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: r2Key,
        Body: fileBuffer,
        ContentType: contentType,
      })
    );
    return true;
  } catch (error) {
    console.error(`  ❌ Failed to upload ${r2Key}:`, error.message);
    return false;
  }
}

async function main() {
  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No files will be uploaded. Use --execute to perform actual upload.\n');
  } else {
    console.log('🚀 EXECUTION MODE - Starting upload to R2 via S3 API...\n');
  }

  console.log(`Source: ${SOURCE_DIR}`);
  console.log(`Target: R2 bucket "${R2_BUCKET_NAME}"\n`);

  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`❌ Source directory not found: ${SOURCE_DIR}`);
    process.exit(1);
  }

  const allFiles = walk(SOURCE_DIR);
  // Filter out .attrs files (PocketBase metadata)
  const files = allFiles.filter(f => !f.endsWith('.attrs'));
  
  console.log(`Found ${files.length} files to upload (skipped ${allFiles.length - files.length} .attrs files).`);

  let uploaded = 0;
  let failed = 0;

  // We can do concurrent uploads to speed it up significantly.
  // Using a simple batching mechanism.
  const BATCH_SIZE = 20;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    
    // We log the progress of the batch
    process.stdout.write(`[${Math.min(i + BATCH_SIZE, files.length)}/${files.length}] ${isDryRun ? 'Dry run' : 'Uploading'} batch... `);

    const promises = batch.map(async (filePath) => {
      const r2Key = path.relative(path.dirname(SOURCE_DIR), filePath);
      const ok = await uploadToR2(filePath, r2Key);
      return ok;
    });

    const results = await Promise.all(promises);
    
    let batchFailed = 0;
    results.forEach(ok => {
      if (ok) uploaded++;
      else {
        failed++;
        batchFailed++;
      }
    });

    if (batchFailed === 0) {
      console.log('✅');
    } else {
      console.log(`❌ (${batchFailed} failed)`);
    }
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${isDryRun ? '🔍 Dry Run Summary' : '✅ Upload Summary'}
${isDryRun ? 'To Upload:' : 'Uploaded: '} ${uploaded}
❌ Failed:    ${failed}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${isDryRun ? '\nRun with --execute to perform the actual upload.' : ''}
`);

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('💥 Unhandled error:', err);
  process.exit(1);
});
