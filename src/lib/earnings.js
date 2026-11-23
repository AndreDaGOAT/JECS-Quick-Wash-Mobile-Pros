// ── Earnings ──────────────────────────────────────────────────────────────────
// Talks to t3_my_earnings_totals(), t3_my_earnings_periods() and
// t3_my_earnings_summary() in Supabase. All three run as the signed-in Wash
// Pro, so none of them takes an id — the database works out who is asking and
// returns only that person's money.

import { sbRpc } from "./supabase";

export const GRAINS = [
  { id: "day",   label: "Day",   periods: 14, heading: "Today" },
  { id: "week",  label: "Week",  periods: 12, heading: "This week" },
  { id: "month", label: "Month", periods: 12, heading: "This month" },
  { id: "year",  label: "Year",  periods: 5,  heading: "This year" },
];

export async function fetchTotals(accessToken) {
  const rows = await sbRpc("t3_my_earnings_totals", {}, accessToken);
  return Array.isArray(rows) ? rows[0] || null : rows || null;
}

export async function fetchPeriods(grain, limit, accessToken) {
  const rows = await sbRpc("t3_my_earnings_periods",
    { p_grain: grain, p_limit: limit }, accessToken);
  return Array.isArray(rows) ? rows : [];
}

export async function fetchBalance(accessToken) {
  const rows = await sbRpc("t3_my_earnings_summary", {}, accessToken);
  return Array.isArray(rows) ? rows[0] || null : rows || null;
}

// ── Formatting ────────────────────────────────────────────────────────────────

// Whole dollars read better on a phone; cents only where they matter.
export function money(cents, { cents: showCents = true } = {}) {
  if (cents == null) return "—";
  const neg = cents < 0;
  const v = Math.abs(cents) / 100;
  const s = v.toLocaleString("en-US", {
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  });
  return `${neg ? "−" : ""}$${s}`;
}

// Split so the screen can set the cents smaller than the dollars.
export function moneyParts(cents) {
  const neg = (cents || 0) < 0;
  const v = Math.abs(cents || 0) / 100;
  const whole = Math.floor(v).toLocaleString("en-US");
  const frac  = String(Math.round((v - Math.floor(v)) * 100)).padStart(2, "0");
  return { sign: neg ? "−" : "", whole, frac };
}

// The database already labels each period. Only the most recent one needs
// rewriting, because "Today" beats "Sun, Nov 22" at a glance.
export function periodLabel(row, grain, asOf) {
  if (!row) return "";
  if (grain === "day") {
    if (row.period_start === asOf) return "Today";
    if (row.period_start === shiftDay(asOf, -1)) return "Yesterday";
  }
  if (grain === "week"  && row.period_start <= asOf && asOf <= row.period_end) return "This week";
  if (grain === "month" && row.period_start <= asOf && asOf <= row.period_end) return "This month";
  if (grain === "year"  && row.period_start <= asOf && asOf <= row.period_end) return "This year";
  return row.period_label;
}

function shiftDay(dateStr, days) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function jobsLabel(n) {
  return `${n || 0} ${n === 1 ? "job" : "jobs"}`;
}

// Which headline figure goes with the selected grain.
export function totalFor(totals, grain) {
  if (!totals) return { cents: 0, jobs: 0 };
  switch (grain) {
    case "week":  return { cents: totals.week_cents,  jobs: totals.week_jobs  };
    case "month": return { cents: totals.month_cents, jobs: totals.month_jobs };
    case "year":  return { cents: totals.year_cents,  jobs: totals.year_jobs  };
    default:      return { cents: totals.today_cents, jobs: totals.today_jobs };
  }
}

// An average worth showing: only over periods the Wash Pro actually worked,
// so a fortnight off does not make every day look like a bad day.
export function averagePerWorkedPeriod(rows) {
  const worked = (rows || []).filter(r => (r.job_count || 0) > 0);
  if (!worked.length) return null;
  const total = worked.reduce((s, r) => s + (r.amount_cents || 0), 0);
  return Math.round(total / worked.length);
}
