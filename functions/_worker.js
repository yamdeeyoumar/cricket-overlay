// ✅ Auto-route all files in /functions/api/* as API endpoints
import { createPagesFunctionHandler } from 'cloudflare:pages';

// this tells Cloudflare to expose each file as an endpoint
export default createPagesFunctionHandler({
  directory: './',
});
