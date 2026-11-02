// GET  /api/state -> { state: "<json string>" | null, updated_at }
// PUT  /api/state  body { state: "<json string>" } replaces the family state.
// Last writer wins. See HANDOVER.md.

const MAX_BYTES = 1024 * 1024; // 1 MB

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export async function onRequestGet({ env }) {
  const row = await env.DB.prepare(
    "SELECT state, updated_at FROM kv WHERE id = 'family'"
  ).first();
  return json({ state: row ? row.state : null, updated_at: row ? row.updated_at : null });
}

export async function onRequestPut({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  if (!body || typeof body.state !== "string") return json({ error: "bad body" }, 400);
  if (body.state.length > MAX_BYTES) return json({ error: "too large" }, 413);
  try { JSON.parse(body.state); } catch { return json({ error: "state is not json" }, 400); }

  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO kv (id, state, updated_at) VALUES ('family', ?1, ?2) " +
    "ON CONFLICT(id) DO UPDATE SET state = ?1, updated_at = ?2"
  ).bind(body.state, now).run();
  return json({ ok: true, updated_at: now });
}
