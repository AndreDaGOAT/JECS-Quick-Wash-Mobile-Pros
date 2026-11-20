// ── Day planning ──────────────────────────────────────────────────────────────
// Talks to wp_day_plan() and wp_gap_fillers() in Supabase. Both run as the
// signed-in Wash Pro, so neither takes an id — the database works out who is
// asking and returns only their own day.

import { sbRpc } from "./supabase";

export async function fetchDayPlan(dateStr, accessToken) {
  const rows = await sbRpc("wp_day_plan", { p_date: dateStr }, accessToken);
  return Array.isArray(rows) ? rows : [];
}

export async function fetchGapFillers(dateStr, accessToken) {
  const rows = await sbRpc("wp_gap_fillers", { p_date: dateStr }, accessToken);
  return Array.isArray(rows) ? rows : [];
}

// Save this Wash Pro's starting point (contractors only — employees start
// from their assigned facility, which an admin sets).
export async function saveBaseLocation({ address, latitude, longitude }, accessToken) {
  return sbRpc("wp_set_base_location", {
    p_address:   address   || "",
    p_latitude:  latitude,
    p_longitude: longitude,
  }, accessToken);
}

// ── Formatting ────────────────────────────────────────────────────────────────
// Timestamps come back as local wall-clock strings ("2026-11-20T08:14:00").
// Read the time straight out of the string — passing it through Date() would
// shift it by the browser's timezone and show the wrong hour.

export function hhmm(ts) {
  if (!ts) return "—";
  const m = String(ts).match(/T(\d{2}):(\d{2})/);
  if (!m) return "—";
  let h = parseInt(m[1], 10);
  const suffix = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12; else if (h > 12) h -= 12;
  return `${h}:${m[2]} ${suffix}`;
}

export function duration(mins) {
  if (mins == null) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h)      return `${h}h`;
  return `${m}m`;
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function friendlyDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const t  = todayStr();
  if (dateStr === t)                return "Today";
  if (dateStr === shiftDate(t, 1))  return "Tomorrow";
  if (dateStr === shiftDate(t, -1)) return "Yesterday";
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// ── Day summary ───────────────────────────────────────────────────────────────
export function summarise(plan) {
  const jobs   = plan.filter(r => r.kind === "job");
  const gaps   = plan.filter(r => r.kind === "gap");
  const onSite = jobs.reduce((n, r) => n + (r.service_minutes || 0), 0);
  const travel = jobs.reduce((n, r) => n + (r.travel_minutes  || 0), 0);
  const open   = gaps.reduce((n, r) => n + (r.gap_minutes     || 0), 0);
  return { jobCount: jobs.length, onSite, travel, open };
}
