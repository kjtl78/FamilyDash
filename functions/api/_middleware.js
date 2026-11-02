// Runs before every /api/* request. Verifies the Cloudflare Access login token.
// Fails CLOSED: if Access is not configured, the API refuses to serve data.

function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function verifyAccessJwt(token, env) {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [h, p, s] = parts;
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));

  const certsRes = await fetch(`https://${env.TEAM_DOMAIN}/cdn-cgi/access/certs`);
  if (!certsRes.ok) return false;
  const certs = await certsRes.json();
  const jwk = certs.keys.find((k) => k.kid === header.kid);
  if (!jwk) return false;

  const key = await crypto.subtle.importKey(
    "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]
  );
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5", key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`)
  );
  if (!ok) return false;

  const now = Math.floor(Date.now() / 1000);
  const audOk = Array.isArray(payload.aud)
    ? payload.aud.includes(env.POLICY_AUD)
    : payload.aud === env.POLICY_AUD;
  return audOk && payload.exp > now && payload.iss === `https://${env.TEAM_DOMAIN}`;
}

export async function onRequest(context) {
  const { request, env, next } = context;

  // Local development only: set DEV=1 in .dev.vars. Never set this in production.
  if (env.DEV === "1") return next();

  if (!env.TEAM_DOMAIN || !env.POLICY_AUD) {
    return new Response("Access not configured", { status: 503 });
  }
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return new Response("Unauthorized", { status: 401 });
  try {
    if (!(await verifyAccessJwt(token, env))) {
      return new Response("Forbidden", { status: 403 });
    }
  } catch (e) {
    return new Response("Forbidden", { status: 403 });
  }
  return next();
}
