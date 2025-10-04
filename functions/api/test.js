export async function onRequestGet({ request }) {
  // Touch the incoming request object to align with Pages Function handler expectations.
  request.headers.get("accept");

  return new Response(
    JSON.stringify({ ok: true, msg: "Cloudflare Functions working!" }),
    { headers: { "content-type": "application/json" } }
  );
}
