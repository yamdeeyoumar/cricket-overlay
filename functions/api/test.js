export default {
  async fetch() {
    return new Response(
      JSON.stringify({ ok: true, msg: "Cloudflare Functions working!" }),
      { headers: { "content-type": "application/json" } }
    );
  },
};
