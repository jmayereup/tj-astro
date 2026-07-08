const isNode = typeof process !== 'undefined' && process.env;

export const GHOST_API_URL = 
  (isNode ? process.env.GHOST_API_URL : undefined) || 
  import.meta.env.GHOST_API_URL || 
  '';

export const GHOST_CONTENT_API_KEY = 
  (isNode ? process.env.GHOST_CONTENT_API_KEY : undefined) || 
  import.meta.env.GHOST_CONTENT_API_KEY || 
  '';

export const POCKETBASE_EMAIL = 
  (isNode ? (process.env.POCKETBASE_EMAIL || process.env.POCKETBASE_ADMIN_EMAIL) : undefined) || 
  import.meta.env.POCKETBASE_EMAIL || 
  import.meta.env.POCKETBASE_ADMIN_EMAIL || 
  '';

export const POCKETBASE_PASSWORD = 
  (isNode ? (process.env.POCKETBASE_PASSWORD || process.env.POCKETBASE_ADMIN_PASSWORD) : undefined) || 
  import.meta.env.POCKETBASE_PASSWORD || 
  import.meta.env.POCKETBASE_ADMIN_PASSWORD || 
  '';

export const PUBLIC_POCKETBASE_URL = 
  (isNode ? process.env.PUBLIC_POCKETBASE_URL : undefined) || 
  import.meta.env.PUBLIC_POCKETBASE_URL || 
  'https://blog.teacherjake.com';
