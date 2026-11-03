// Minimal iCalendar (.ics) reader for a "week ahead" view.
// Handles: timed + all-day events, TZID/UTC times, RRULE (DAILY/WEEKLY/MONTHLY/YEARLY with
// INTERVAL, COUNT, UNTIL, BYDAY incl. ordinals, BYMONTHDAY), EXDATE, RECURRENCE-ID overrides.
// Not handled: RDATE, BYSETPOS, BYWEEKNO, sub-daily recurrence. See HANDOVER.md.

const DOW = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };
const DAY = 86400000;

function unfold(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function splitProp(line) {
  let inQ = false, idx = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ":" && !inQ) { idx = i; break; }
  }
  if (idx < 0) return null;
  const parts = line.slice(0, idx).split(";");
  const name = parts.shift().toUpperCase();
  const params = {};
  parts.forEach((p) => {
    const e = p.indexOf("=");
    if (e > 0) params[p.slice(0, e).toUpperCase()] = p.slice(e + 1).replace(/^"|"$/g, "");
  });
  return { name, params, value: line.slice(idx + 1) };
}

const unescapeText = (s) => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

function tzOffsetMs(utcMs, tz) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric",
  });
  const p = {};
  f.formatToParts(new Date(utcMs)).forEach((x) => { p[x.type] = x.value; });
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

export function zonedToUtc(y, mo, d, h, mi, s, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const first = guess - tzOffsetMs(guess, tz);
  return guess - tzOffsetMs(first, tz);
}

function safeTz(tz, fallback) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return fallback; }
}

function dateKeyInTz(utcMs, tz) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(new Date(utcMs));
}

const key = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const keyToDate = (k) => { const p = k.split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); };
const dateToKey = (dt) => key(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());

function parseDT(prop, defaultTz) {
  const v = prop.value.trim();
  if (/^\d{8}$/.test(v)) return { allDay: true, date: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` };
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const [, Y, Mo, D, H, Mi, S, Z] = m;
  const tz = Z ? "UTC" : safeTz(prop.params.TZID || defaultTz, defaultTz);
  return {
    allDay: false, y: +Y, mo: +Mo, d: +D, h: +H, mi: +Mi, s: +S, tz,
    utc: zonedToUtc(+Y, +Mo, +D, +H, +Mi, +S, tz),
  };
}

function parseRule(v) {
  const r = {};
  v.split(";").forEach((kv) => {
    const [k, val] = kv.split("=");
    if (!k || val === undefined) return;
    switch (k.toUpperCase()) {
      case "FREQ": r.freq = val.toUpperCase(); break;
      case "INTERVAL": r.interval = Math.max(1, parseInt(val, 10) || 1); break;
      case "COUNT": r.count = parseInt(val, 10) || undefined; break;
      case "UNTIL": r.until = `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}`; break;
      case "BYDAY":
        r.byday = val.split(",").map((t) => {
          const m = t.match(/^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/i);
          return m ? { n: m[1] ? parseInt(m[1], 10) : 0, dow: DOW[m[2].toUpperCase()] } : null;
        }).filter(Boolean);
        break;
      case "BYMONTHDAY": r.bymonthday = val.split(",").map(Number); break;
      case "BYMONTH": r.bymonth = val.split(",").map(Number); break;
    }
  });
  return r;
}

const dowOf = (dt) => (dt.getUTCDay() + 6) % 7;

function matchDay(rule, start, date) {
  if (date < start) return false;
  const diff = Math.round((date - start) / DAY);
  const interval = rule.interval || 1;
  const by = rule.byday || [];
  switch (rule.freq) {
    case "DAILY":
      if (diff % interval) return false;
      return !by.length || by.some((b) => b.dow === dowOf(date));
    case "WEEKLY": {
      const sd = dowOf(start);
      if (Math.floor((diff + sd) / 7) % interval) return false;
      const allowed = by.length ? by.map((b) => b.dow) : [sd];
      return allowed.includes(dowOf(date));
    }
    case "MONTHLY": {
      const md = (date.getUTCFullYear() - start.getUTCFullYear()) * 12 + date.getUTCMonth() - start.getUTCMonth();
      if (md % interval) return false;
      if (by.length) {
        const dom = date.getUTCDate();
        const dim = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
        return by.some((b) => {
          if (b.dow !== dowOf(date)) return false;
          if (!b.n) return true;
          return b.n > 0 ? Math.ceil(dom / 7) === b.n : b.n === -1 && dom + 7 > dim;
        });
      }
      return (rule.bymonthday || [start.getUTCDate()]).includes(date.getUTCDate());
    }
    case "YEARLY": {
      if ((date.getUTCFullYear() - start.getUTCFullYear()) % interval) return false;
      const bm = rule.bymonth || [start.getUTCMonth() + 1];
      return bm.includes(date.getUTCMonth() + 1) && date.getUTCDate() === start.getUTCDate();
    }
    default: return false;
  }
}

function parseDuration(v) {
  const m = (v || "").match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  return ((+m[1] || 0) * 7 + (+m[2] || 0)) * DAY + (+m[3] || 0) * 3600000 + (+m[4] || 0) * 60000 + (+m[5] || 0) * 1000;
}

function parseEvents(text, tz) {
  const events = [];
  let cur = null, inAlarm = false;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") { cur = { ex: [] }; continue; }
    if (line === "END:VEVENT") { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    if (line === "BEGIN:VALARM") { inAlarm = true; continue; }
    if (line === "END:VALARM") { inAlarm = false; continue; }
    if (inAlarm) continue;
    const p = splitProp(line);
    if (!p) continue;
    switch (p.name) {
      case "UID": cur.uid = p.value; break;
      case "SUMMARY": cur.title = unescapeText(p.value); break;
      case "LOCATION": cur.location = unescapeText(p.value); break;
      case "STATUS": cur.status = p.value.toUpperCase(); break;
      case "DTSTART": cur.dtstart = parseDT(p, tz); break;
      case "DTEND": cur.dtend = parseDT(p, tz); break;
      case "DURATION": cur.duration = parseDuration(p.value); break;
      case "RRULE": cur.rrule = parseRule(p.value); break;
      case "EXDATE":
        p.value.split(",").forEach((v) => { const d = parseDT({ value: v, params: p.params }, tz); if (d) cur.ex.push(d); });
        break;
      case "RECURRENCE-ID": cur.recId = parseDT(p, tz); break;
      case "X-APPLE-CREATOR-IDENTITY": if (/spond/i.test(p.value)) cur.source = "spond"; break;
    }
  }
  return events.filter((e) => e.dtstart && e.status !== "CANCELLED");
}

function originalKey(d, evTz) {
  if (d.allDay) return d.date;
  if (d.tz === "UTC" && evTz !== "UTC") return dateKeyInTz(d.utc, evTz);
  return key(d.y, d.mo, d.d);
}

export function expandWeek(icsText, { tz, startDate, days = 7 }) {
  tz = safeTz(tz, "UTC");
  const sd = keyToDate(startDate);
  const winStart = zonedToUtc(sd.getUTCFullYear(), sd.getUTCMonth() + 1, sd.getUTCDate(), 0, 0, 0, tz);
  const ed = new Date(sd.getTime() + days * DAY);
  const winEnd = zonedToUtc(ed.getUTCFullYear(), ed.getUTCMonth() + 1, ed.getUTCDate(), 0, 0, 0, tz);
  const endKey = dateToKey(ed);

  const events = parseEvents(icsText, tz);
  const overrides = new Set();
  events.forEach((e) => { if (e.recId) overrides.add(`${e.uid}|${originalKey(e.recId, e.dtstart.tz || tz)}`); });

  const out = [];
  const push = (e, occ) => {
    out.push({
      title: e.title || "(no title)", location: e.location || "",
      source: e.source || "",
      allDay: occ.allDay, start: occ.start, end: occ.end,
      _sort: occ.allDay ? zonedToUtc(...keyToDate(occ.start).toISOString().slice(0, 10).split("-").map(Number).slice(0, 3), 0, 0, 0, tz) : Date.parse(occ.start),
    });
  };

  const occurrenceOn = (e, dateKey) => {
    const s = e.dtstart;
    if (s.allDay) {
      let spanDays = 1;
      if (e.dtend && e.dtend.allDay) spanDays = Math.max(1, Math.round((keyToDate(e.dtend.date) - keyToDate(s.date)) / DAY));
      const endK = dateToKey(new Date(keyToDate(dateKey).getTime() + spanDays * DAY));
      return { allDay: true, start: dateKey, end: endK, overlaps: dateKey < endKey && endK > startDate };
    }
    const dk = keyToDate(dateKey);
    const st = zonedToUtc(dk.getUTCFullYear(), dk.getUTCMonth() + 1, dk.getUTCDate(), s.h, s.mi, s.s, s.tz);
    let dur = 0;
    if (e.dtend && !e.dtend.allDay) dur = Math.max(0, e.dtend.utc - s.utc);
    else if (e.duration != null) dur = e.duration;
    const en = st + dur;
    return {
      allDay: false, start: new Date(st).toISOString(), end: new Date(en).toISOString(),
      overlaps: dur > 0 ? st < winEnd && en > winStart : st >= winStart && st < winEnd,
    };
  };

  for (const e of events) {
    // Single events and overrides
    if (!e.rrule) {
      const dateKey = e.dtstart.allDay ? e.dtstart.date : dateKeyInTz(e.dtstart.utc, e.dtstart.tz === "UTC" ? tz : e.dtstart.tz);
      let occ;
      if (e.dtstart.allDay) occ = occurrenceOn(e, dateKey);
      else {
        const st = e.dtstart.utc;
        let dur = 0;
        if (e.dtend && !e.dtend.allDay) dur = Math.max(0, e.dtend.utc - st);
        else if (e.duration != null) dur = e.duration;
        occ = {
          allDay: false, start: new Date(st).toISOString(), end: new Date(st + dur).toISOString(),
          overlaps: dur > 0 ? st < winEnd && st + dur > winStart : st >= winStart && st < winEnd,
        };
      }
      if (occ.overlaps) push(e, occ);
      continue;
    }

    // Recurring master
    const s = e.dtstart;
    const evTz = s.allDay ? tz : s.tz;
    const startKey = s.allDay ? s.date : key(s.y, s.mo, s.d);
    const startD = keyToDate(startKey);
    const skip = new Set(e.ex.map((x) => originalKey(x, evTz)));
    const rule = e.rrule;

    const first = new Date(sd.getTime() - DAY);
    const last = new Date(sd.getTime() + (days + 1) * DAY);
    const candidates = [];
    if (rule.count) {
      let n = 0;
      for (let t = startD.getTime(), guard = 0; t <= last.getTime() && n < rule.count && guard < 4000; t += DAY, guard++) {
        const dt = new Date(t);
        if (rule.until && dateToKey(dt) > rule.until) break;
        if (matchDay(rule, startD, dt)) { n++; if (t >= first.getTime()) candidates.push(dateToKey(dt)); }
      }
    } else {
      for (let t = first.getTime(); t <= last.getTime(); t += DAY) {
        const dt = new Date(t);
        if (rule.until && dateToKey(dt) > rule.until) continue;
        if (matchDay(rule, startD, dt)) candidates.push(dateToKey(dt));
      }
    }
    for (const k of candidates) {
      if (skip.has(k) || overrides.has(`${e.uid}|${k}`)) continue;
      const occ = occurrenceOn(e, k);
      if (occ.overlaps) push(e, occ);
    }
  }

  out.sort((a, b) => a._sort - b._sort || (a.allDay === b.allDay ? 0 : a.allDay ? -1 : 1));
  const seen = new Set();
  return out.filter((e) => {
    const k = `${e.title}|${e.start}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map(({ _sort, ...rest }) => rest);
}
