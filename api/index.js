// Vercel entrypoint: reuses the Cloudflare Worker handler, passing
// process.env in place of the Worker `env` binding.
import worker from "../worker.js";

export default {
  fetch(request) {
    return worker.fetch(request, process.env);
  },
};
