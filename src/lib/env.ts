const isNode = typeof process !== 'undefined' && process.env;
const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;

export const GHOST_API_URL = 
  (isNode ? process.env.GHOST_API_URL : undefined) || 
  metaEnv?.GHOST_API_URL || 
  '';

export const GHOST_CONTENT_API_KEY = 
  (isNode ? process.env.GHOST_CONTENT_API_KEY : undefined) || 
  metaEnv?.GHOST_CONTENT_API_KEY || 
  '';

export const POCKETBASE_EMAIL = 
  (isNode ? (process.env.POCKETBASE_EMAIL || process.env.POCKETBASE_ADMIN_EMAIL) : undefined) || 
  metaEnv?.POCKETBASE_EMAIL || 
  metaEnv?.POCKETBASE_ADMIN_EMAIL || 
  '';

export const POCKETBASE_PASSWORD = 
  (isNode ? (process.env.POCKETBASE_PASSWORD || process.env.POCKETBASE_ADMIN_PASSWORD) : undefined) || 
  metaEnv?.POCKETBASE_PASSWORD || 
  metaEnv?.POCKETBASE_ADMIN_PASSWORD || 
  '';

export const PUBLIC_POCKETBASE_URL = 
  (isNode ? process.env.PUBLIC_POCKETBASE_URL : undefined) || 
  metaEnv?.PUBLIC_POCKETBASE_URL || 
  'https://pb.teacherjake.com';

export const PUBLIC_SUBMISSION_URL = 
  (isNode ? process.env.PUBLIC_SUBMISSION_URL : undefined) || 
  metaEnv?.PUBLIC_SUBMISSION_URL || 
  '';



