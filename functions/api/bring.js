// GET /api/bring -> { list: {name}, items: [{name, spec}] }
// READ-ONLY mirror of one Bring! list, using Bring!'s UNOFFICIAL web API (the one community
// libraries and Home Assistant use). It can change or be blocked at any time.
// Secrets: BRING_EMAIL, BRING_PASSWORD. Optional: BRING_LIST_NAME (default: account's main list).
// Use a DEDICATED Bring! account that the real list is shared with, not a personal login.

const BASE = "https://api.getbring.com/rest/v2/";
const DEFAULT_KEY = "cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp"; // public key used by Bring!'s own web client

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

let session = null; // best-effort cache inside the running worker instance

const baseHeaders = (env) => ({
  "X-BRING-API-KEY": env.BRING_API_KEY || DEFAULT_KEY,
  "X-BRING-CLIENT": "webApp",
  "X-BRING-CLIENT-SOURCE": "webApp",
  "X-BRING-COUNTRY": env.BRING_COUNTRY || "DE",
});

async function login(env) {
  const res = await fetch(BASE + "bringauth", {
    method: "POST",
    headers: baseHeaders(env),
    body: new URLSearchParams({ email: env.BRING_EMAIL, password: env.BRING_PASSWORD }),
  });
  if (!res.ok) throw new Error("login");
  const d = await res.json();
  if (!d.access_token || !d.uuid) throw new Error("login");
  session = {
    token: d.access_token, uuid: d.uuid, mainList: d.bringListUUID,
    exp: Date.now() + Math.max(60, (d.expires_in || 3600) - 120) * 1000,
  };
  return session;
}

const authHeaders = (env, s) => ({ ...baseHeaders(env), "X-BRING-USER-UUID": s.uuid, Authorization: `Bearer ${s.token}` });

async function getJson(env, path, retry = true) {
  if (!session || Date.now() > session.exp) await login(env);
  const res = await fetch(BASE + path, { headers: authHeaders(env, session) });
  if (res.status === 401 && retry) { session = null; return getJson(env, path, false); }
  if (!res.ok) throw new Error("http " + res.status);
  return res.json();
}

export async function onRequestGet({ env }) {
  if (!env.BRING_EMAIL || !env.BRING_PASSWORD) return json({ error: "Bring! is not connected yet (BRING_EMAIL / BRING_PASSWORD not set)." }, 501);
  try {
    if (!session || Date.now() > session.exp) await login(env);
    let listUuid = session.mainList, listName = "";
    const lists = await getJson(env, `bringusers/${session.uuid}/lists`);
    const all = (lists && lists.lists) || [];
    if (env.BRING_LIST_NAME) {
      const hit = all.find((l) => (l.name || "").toLowerCase() === env.BRING_LIST_NAME.toLowerCase());
      if (!hit) return json({ error: `No Bring! list named "${env.BRING_LIST_NAME}" is shared with this account.` }, 404);
      listUuid = hit.listUuid; listName = hit.name;
    } else {
      const hit = all.find((l) => l.listUuid === listUuid);
      listName = hit ? hit.name : "";
    }
    const data = await getJson(env, `bringlists/${listUuid}`);
    const purchase = data.purchase || (data.items && data.items.purchase) || [];
    return json({
      list: { name: listName },
      items: purchase.map((p) => ({ name: String(p.itemId || p.name || ""), spec: String(p.specification || "") })).filter((p) => p.name),
    });
  } catch (e) {
    return json({ error: "Could not read the Bring! list. The unofficial Bring! interface may have changed, or the login is wrong." }, 502);
  }
}
