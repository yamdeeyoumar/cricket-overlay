export default {
  async fetch(request, env, ctx) {
    // Auto-route: /api/* → functions/api/*
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/+/, "");

    // Simple router
    if (path.startsWith("api/live")) {
      const mod = await import("./api/live.js");
      return mod.default.fetch(request, env, ctx);
    }
    if (path.startsWith("api/test")) {
      const mod = await import("./api/test.js");
      return mod.default.fetch(request, env, ctx);
    }

    return new Response("Not Found", { status: 404 });
  },
};
