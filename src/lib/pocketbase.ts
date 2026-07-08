import PocketBase from 'pocketbase';
import { POCKETBASE_EMAIL, POCKETBASE_PASSWORD, PUBLIC_POCKETBASE_URL } from './env';

// You will need to add this to your .env file
export const pb = new PocketBase(PUBLIC_POCKETBASE_URL);

// Disable auto-cancellation to avoid fetch errors during build
pb.autoCancellation(false);

const pbEmail = POCKETBASE_EMAIL;
const pbPassword = POCKETBASE_PASSWORD;

if (pbEmail && pbPassword) {
  try {
    // Authenticate as superuser/admin to bypass restricted API rules.
    // Try PocketBase v0.23+ superusers collection first.
    await pb.collection('_superusers').authWithPassword(pbEmail, pbPassword);
  } catch (e) {
    try {
      // Fallback for older PocketBase versions (< 0.23)
      await pb.admins.authWithPassword(pbEmail, pbPassword);
    } catch (oldErr) {
      try {
        // Fallback for regular users (e.g. with isAdmin flag)
        await pb.collection('users').authWithPassword(pbEmail, pbPassword);
      } catch (userErr) {
        console.error('PocketBase initialization: authentication failed:', userErr);
      }
    }
  }
}

