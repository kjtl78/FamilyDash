// POST /api/ideas  body: { liked: [names], all: [names], staples: [words], rejected: [names] }
// Suggests new dinner ideas with Cloudflare Workers AI (binding "AI"). No web access.
// Optional variable AI_MODEL overrides the default model.

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const clean = (a, max, len = 80) =>
  (Array.isArray(a) ? a : []).filter((x) => typeof x === "string").map((x) => x.trim().slice(0, len)).filter(Boolean).slice(0, max);

export async function onRequestPost({ request, env }) {
  if (!env.AI) return json({ error: "AI is not enabled. Add the Workers AI binding named AI." }, 501);
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }

  const liked = clean(body.liked, 15), all = clean(body.all, 60), staples = clean(body.staples, 60, 40), rejected = clean(body.rejected, 40);
  const quick = body.quick !== false;
  const maxMinutes = Number.isFinite(+body.maxMinutes)
    ? Math.max(15, Math.min(120, +body.maxMinutes))
    : quick ? 30 : 60;

  const system =
    "You are a practical home-cooking assistant for a busy Norwegian family. You reply with JSON only, no prose, no markdown.";
  const user = [
    "Suggest 4 NEW family dinner ideas for a normal Norwegian supermarket (Rema 1000, Kiwi, Meny).",
    `Every idea must be a weeknight dinner ready in ${maxMinutes} minutes or less.`,
    `Dishes the family already cooks: ${all.join("; ") || "none yet"}.`,
    `Dishes they especially like: ${liked.join("; ") || "unknown"}.`,
    `Ingredients they always have at home: ${staples.join(", ") || "unknown"}.`,
    `Do not suggest these or close variants: ${[...all, ...rejected].join("; ") || "none"}.`,
    "Rules:",
    "- Use at most 8 ingredients that are not in the always-at-home list.",
    "- Only common spices and condiments: salt, pepper, paprika, oregano, thyme, curry, cumin, cinnamon, stock, soy sauce, mustard, ketchup, mayonnaise. No exotic or one-use spices or sauces.",
    "- Avoid ingredients bought for one dish and wasted. At most one special fresh ingredient per dish.",
    "- Prefer one pan or one pot, simple prep, and ingredients that repeat across the week.",
    "- Prefer dishes similar to the ones they already like. No restaurant-style or advanced techniques.",
    'Return ONLY a JSON array of 4 objects: [{"name": string, "why": one short sentence, "effort": 1|2|3 (1 easy, 2 medium, 3 involved), "minutes": whole number, "ingredients": [strings, with rough quantities]}]',
  ].join("\n");

  const model = env.AI_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  let out;
  try {
    out = await env.AI.run(model, {
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      max_tokens: 1400,
      temperature: 0.8,
    });
  } catch {
    return json({ error: "The AI request failed. The model name may be wrong or the free daily limit is used up." }, 502);
  }

  let text = out && out.response;
  if (typeof text !== "string") text = JSON.stringify(text || "");
  let arr = null;
  try { arr = JSON.parse(text); } catch {
    const m = text.match(/\[[\s\S]*\]/);
    if (m) { try { arr = JSON.parse(m[0]); } catch { /* ignore */ } }
  }
  if (arr && !Array.isArray(arr) && Array.isArray(arr.ideas)) arr = arr.ideas;
  if (!Array.isArray(arr)) return json({ error: "The AI answer could not be read. Try again." }, 502);

  const ideas = arr.slice(0, 8).map((x) => {
    const effort = [1, 2, 3].includes(+x.effort) ? +x.effort : 2;
    const minutes = Number.isFinite(+x.minutes)
      ? Math.max(10, Math.min(240, Math.round(+x.minutes)))
      : effort === 1 ? 30 : effort === 3 ? 60 : 45;
    return {
      name: String((x && x.name) || "").trim().slice(0, 80),
      why: String((x && x.why) || "").trim().slice(0, 200),
      effort,
      minutes,
      ingredients: clean(x && x.ingredients, 14, 60),
    };
  }).filter((x) => x.name && x.ingredients.length && (!quick || x.minutes <= maxMinutes + 5));

  return json({ ideas });
}
