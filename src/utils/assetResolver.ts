import type { ImageMetadata } from 'astro';

const R2_BASE_URL = 'https://files.teacherjake.com';

/**
 * Dynamically resolves a localized asset path to its metadata or URL.
 * Images → resolved from src/assets via Astro glob (optimized, hashed)
 * Non-images (audio, PDF) → resolved to R2 URL
 */
const ghostImages = import.meta.glob<{ default: ImageMetadata }>('/src/assets/ghost-assets/**/*.{jpg,jpeg,png,webp,avif,gif}');
const pbImages = import.meta.glob<{ default: ImageMetadata }>('/src/assets/pocketbase-assets/**/*.{jpg,jpeg,png,webp,avif,gif}');

export async function resolveLocalizedImage(type: 'gh' | 'pb', id: string, filename: string): Promise<ImageMetadata | string | undefined> {
  const subDir = type === 'gh' ? 'ghost-assets' : 'pocketbase-assets';
  const glob = type === 'gh' ? ghostImages : pbImages;

  // Try exact match first
  let seekPath = `/src/assets/${subDir}/${id}/${filename}`;
  let loader = glob[seekPath];

  // If no exact match and no extension, try common extensions
  if (!loader && !filename.includes('.')) {
    const extensions = ['.jpg', '.jpeg', '.png', '.webp'];
    for (const ext of extensions) {
      const altPath = `/src/assets/${subDir}/${id}/${filename}${ext}`;
      if (glob[altPath]) {
        seekPath = altPath;
        loader = glob[altPath];
        break;
      }
    }
  }

  if (loader) {
    const mod = await loader();
    return mod.default;
  }

  // Not found in src/assets — return undefined to trigger fallback to remote URL
  return undefined;
}

/**
 * Resolves a non-image asset (audio, PDF) to its R2 URL.
 *
 * For PocketBase assets, pass collectionId so the URL matches the path
 * PocketBase writes directly: {collectionId}/{recordId}/{filename}
 *
 * For Ghost assets, uses the ghost-assets/{id}/{filename} prefix.
 */
export function resolveLocalizedAsset(type: 'gh' | 'pb', id: string, filename: string, collectionId?: string): string {
  if (type === 'pb' && collectionId) {
    return `${R2_BASE_URL}/${collectionId}/${id}/${filename}`;
  }
  const subDir = type === 'gh' ? 'ghost-assets' : 'pocketbase-assets';
  return `${R2_BASE_URL}/${subDir}/${id}/${filename}`;
}
