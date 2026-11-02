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

  const system =
    "You are a practical home-cooking assistant for a busy family. You reply with JSON only, no prose, no markdown.";
  const user = [
    "Suggest 4 NEW family dinner ideas.",
    `Dishes the family already cooks: ${all.join("; ") || "none yet"}.`,
    `Dishes they especially like: ${liked.join("; ") || "unknown"}.`,
    `Ingredients they always have at home: ${staples.join(", ") || "unknown"}.`,
    `Do not suggest these or close variants: ${[...all, ...rejected].join("; ") || "none"}.`,
    "Rules:",
    "- Mostly ordinary supermarket ingredients. At most 8 ingredients that are not always-at-home items.",
    "- Avoid ingredients likely to be used once and wasted: exotic spices, specialty sauces, unusual produce, large packs. One unusual fresh vegetable is acceptable.",
    "- Prefer dishes that reuse ingredients from the dishes they already cook.",
    "- Prefer easy or medium effort.",
    'Return ONLY a JSON array of 4 objects: [{"name": string, "why": one short sentence, "effort": 1|2|3 (1 easy, 2 medium, 3 involved), "ingredients": [strings, with rough quantities]}]',
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

  const ideas = arr.slice(0, 6).map((x) => ({
    name: String((x && x.name) || "").trim().slice(0, 80),
    why: String((x && x.why) || "").trim().slice(0, 200),
    effort: [1, 2, 3].includes(+x.effort) ? +x.effort : 2,
    ingredients: clean(x && x.ingredients, 14, 60),
  })).filter((x) => x.name && x.ingredients.length);

  return json({ ideas });
}
