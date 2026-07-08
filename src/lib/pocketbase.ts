import PocketBase from 'pocketbase';

// You will need to add this to your .env file
export const pb = new PocketBase(import.meta.env.PUBLIC_POCKETBASE_URL || 'https://blog.teacherjake.com');

// Disable auto-cancellation to avoid fetch errors during build
pb.autoCancellation(false);

const pbEmail = import.meta.env.POCKETBASE_EMAIL || import.meta.env.POCKETBASE_ADMIN_EMAIL;
const pbPassword = import.meta.env.POCKETBASE_PASSWORD || import.meta.env.POCKETBASE_ADMIN_PASSWORD;

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
      console.error('PocketBase initialization: authentication failed:', e);
    }
  }
}

