import PocketBase from 'pocketbase';
import { PUBLIC_POCKETBASE_URL, PUBLIC_SUBMISSION_URL } from './env';

export const pb = new PocketBase(PUBLIC_POCKETBASE_URL);
pb.autoCancellation(false);

/**
 * Returns the PocketBase client instance for fetching public collections.
 * Worksheets collection list and view rules are public, so authentication is not required during build.
 */
export async function getPb(): Promise<PocketBase> {
  return pb;
}

let cachedSubmissionUrlPromise: Promise<string> | null = null;

/**
 * Fetches the Google Apps Script submission URL dynamically from PocketBase.
 * Halts the build if PocketBase cannot be reached and no PUBLIC_SUBMISSION_URL env is set.
 */
export async function fetchTeacherSubmissionUrl(
  recordId: string = 'sztxr8rn7a7uyun',
  required: boolean = true
): Promise<string> {
  if (PUBLIC_SUBMISSION_URL && PUBLIC_SUBMISSION_URL.trim() !== '') {
    return PUBLIC_SUBMISSION_URL.trim();
  }

  if (cachedSubmissionUrlPromise) {
    return cachedSubmissionUrlPromise;
  }

  cachedSubmissionUrlPromise = (async () => {
    try {
      const record: any = await pb.collection('tj_components_teacher_info').getOne(recordId);
      if (record?.url && typeof record.url === 'string' && record.url.trim() !== '') {
        return record.url.trim();
      }
    } catch (err: any) {
      console.error(`Failed to fetch submission URL from PocketBase (record ${recordId}):`, err?.message || err);
    }

    if (required) {
      throw new Error(
        `Astro build halted: Could not fetch teacher submission URL from PocketBase record "${recordId}" and no PUBLIC_SUBMISSION_URL environment variable was provided.`
      );
    }

    return '';
  })();

  try {
    return await cachedSubmissionUrlPromise;
  } catch (err) {
    cachedSubmissionUrlPromise = null;
    throw err;
  }
}



