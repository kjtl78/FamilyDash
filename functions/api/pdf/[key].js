// GET /api/pdf/<key> — serve a school letter stored in the SCHOOL KV namespace.
// The /api/* middleware already requires a valid Cloudflare Access session, so the
// PDF is private even though the URL is stable.
export async function onRequestGet({ params, env }) {
  if (!env.SCHOOL) return new Response("Storage not configured", { status: 503 });
  const key = Array.isArray(params.key) ? params.key.join("/") : params.key;
  if (!key || !/^[A-Za-z0-9._-]{1,120}$/.test(key)) return new Response("Not found", { status: 404 });

  const file = await env.SCHOOL.get(key, "arrayBuffer");
  if (!file) return new Response("Not found", { status: 404 });

  return new Response(file, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${key}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
