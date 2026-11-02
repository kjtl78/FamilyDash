// GET /api/calendar?tz=Europe/Oslo&start=YYYY-MM-DD
// Reads the family's private Google Calendar iCal feed (secret GCAL_ICS_URL, never sent to the
// browser) and returns the next 7 days of events. Read-only.
import { expandWeek } from "../../lib/ical.js";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export async function onRequestGet({ request, env }) {
  if (!env.GCAL_ICS_URL) return json({ error: "Calendar is not connected yet (GCAL_ICS_URL is not set)." }, 501);

  const u = new URL(request.url);
  const tz = u.searchParams.get("tz") || "UTC";
  const start = u.searchParams.get("start") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return json({ error: "bad start" }, 400);
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); } catch { return json({ error: "bad tz" }, 400); }

  let text;
  try {
    const res = await fetch(env.GCAL_ICS_URL, { cf: { cacheTtl: 300, cacheEverything: true } });
    if (!res.ok) return json({ error: `Google Calendar feed returned ${res.status}. Check the secret link.` }, 502);
    text = await res.text();
  } catch {
    return json({ error: "Could not reach Google Calendar." }, 502);
  }
  if (!text.includes("BEGIN:VCALENDAR")) return json({ error: "The calendar link did not return a calendar." }, 502);

  try {
    return json({ events: expandWeek(text, { tz, startDate: start, days: 7 }), generatedAt: new Date().toISOString() });
  } catch {
    return json({ error: "Could not read the calendar data." }, 500);
  }
}
