// --- Cloudflare Pages Functions routing ---
// This tells Cloudflare to use your `/functions/` directory
// so every file there (like /functions/api/live.ts) becomes an endpoint automatically.

import worker from './functions/_worker.js';
export default worker;
