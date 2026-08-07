import PocketBase from 'pocketbase';
import { PUBLIC_POCKETBASE_URL } from './env';

export const pb = new PocketBase(PUBLIC_POCKETBASE_URL);
pb.autoCancellation(false);

/**
 * Returns the PocketBase client instance for fetching public collections.
 * Worksheets collection list and view rules are public, so authentication is not required during build.
 */
export async function getPb(): Promise<PocketBase> {
  return pb;
}


