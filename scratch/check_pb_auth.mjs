import PocketBase from 'pocketbase';

async function checkPbAuth(email, password) {
  const client = new PocketBase('https://blog.teacherjake.com');
  console.log(`Testing unauthenticated getFullList...`);
  try {
    const recordsPublic = await client.collection('worksheets').getFullList();
    console.log(`Unauthenticated count: ${recordsPublic.length}`);
  } catch (e) {
    console.log(`Unauthenticated error: ${e.message}`);
  }

  if (email && password) {
    console.log(`Testing authenticated as superuser...`);
    try {
      await client.collection('_superusers').authWithPassword(email, password);
      const recordsAuth = await client.collection('worksheets').getFullList();
      console.log(`Authenticated count: ${recordsAuth.length}`);
      const worksheetTypeCount = recordsAuth.filter(r => r.lessonType === 'worksheet').length;
      console.log(`Worksheets with lessonType === 'worksheet': ${worksheetTypeCount}`);
    } catch (e) {
      console.log(`Authenticated error: ${e.message}`);
    }
  }
}

checkPbAuth(process.env.POCKETBASE_EMAIL, process.env.POCKETBASE_PASSWORD);
