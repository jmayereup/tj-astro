
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'];
const url = 'https://blog.teacherjake.com/content/images/2026/04/explaining-thai-food.jpg';
const ext = url.split('?')[0].toLowerCase().split('.').pop();
console.log('ext:', ext);
console.log('matches:', ext && IMAGE_EXTS.some(e => e === `.${ext}`));
