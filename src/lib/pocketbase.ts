import PocketBase from 'pocketbase';
import { POCKETBASE_EMAIL, POCKETBASE_PASSWORD, PUBLIC_POCKETBASE_URL } from './env';

async function createAuthenticatedPb(): Promise<PocketBase> {
  const client = new PocketBase(PUBLIC_POCKETBASE_URL);
  client.autoCancellation(false);

  const pbEmail = POCKETBASE_EMAIL;
  const pbPassword = POCKETBASE_PASSWORD;

  if (pbEmail && pbPassword) {
    try {
      // Authenticate as superuser/admin to bypass restricted API rules.
      // Try PocketBase v0.23+ superusers collection first.
      await client.collection('_superusers').authWithPassword(pbEmail, pbPassword);
    } catch (_e) {
      try {
        // Fallback for older PocketBase versions (< 0.23)
        await client.admins.authWithPassword(pbEmail, pbPassword);
      } catch (_oldErr) {
        try {
          // Fallback for regular users (e.g. with isAdmin flag)
          await client.collection('users').authWithPassword(pbEmail, pbPassword);
        } catch (userErr) {
          console.error('PocketBase initialization: authentication failed:', userErr);
        }
      }
    }
  }

  return client;
}

// Memoize the authenticated client — auth runs once, all callers share the result.
// This prevents race conditions where Astro's parallel getStaticPaths() calls
// use the pb client before the top-level await chain completes.
let _pbPromise: Promise<PocketBase> | null = null;

export function getPb(): Promise<PocketBase> {
  if (!_pbPromise) {
    _pbPromise = createAuthenticatedPb();
  }
  return _pbPromise;
}

// Legacy synchronous export — kept for backwards compatibility.
// IMPORTANT: callers that need guaranteed auth must use getPb() instead.
export const pb = new PocketBase(PUBLIC_POCKETBASE_URL);
pb.autoCancellation(false);

// Kick off auth immediately so the pb singleton is also ready as soon as possible.
getPb().then(authenticated => {
  if (authenticated.authStore.token) {
    pb.authStore.save(authenticated.authStore.token, authenticated.authStore.record);
  }
}).catch(() => {/* silently ignore; auth errors are logged inside createAuthenticatedPb */});

