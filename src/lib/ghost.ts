import GhostContentAPI from '@tryghost/content-api';
import { GHOST_API_URL, GHOST_CONTENT_API_KEY } from './env';

export const ghostClient = new GhostContentAPI({
  url: GHOST_API_URL,
  key: GHOST_CONTENT_API_KEY,
  version: "v5.0"
});
