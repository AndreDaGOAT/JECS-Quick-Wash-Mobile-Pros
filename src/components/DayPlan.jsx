import { useMemo } from "react";
import { useDayPlan } from "../hooks/useDayPlan";
import {
  hhmm, duration, friendlyDate, shiftDate, todayStr, summarise,
} from "../lib/dayPlan";

export default function DayPlan({ session, onClaim, canClaim }) {
  const { date, setDate, plan, fillers, loading, error, reload } = useDayPlan(session);

  const summary = useMemo(() => summarise(plan), [plan]);

  // Claim, then rebuild the day so the new job drops into place.
  async function claimSuggestion(suggestion) {
    try {
      await onClaim(suggestion);
      reload();
    } catch (_) {
      /* the caller already showed the reason */
    }
  }

  // Suggestions arrive flat, each tagged with the gap it belongs to.
  const fillersByGap = useMemo(() => {
    const map = new Map();
    fillers.forEach(f => {
      const key = f.gap_start;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(f);
    });
    return map;
  }, [fillers]);

  const startRow  = plan.find(r => r.kind === "start");
  const noStartPt = startRow && startRow.latitude == null;

  return (
    <div className="day-plan">
      {/* ── Date bar ────────────────────────────────────────────────── */}
      <div className="day-bar">
        <button className="day-nav" onClick={() => setDate(shiftDate(date, -1))}
          aria-label="Previous day">‹</button>
        <div className="day-bar-center">
          <strong className="day-label">{friendlyDate(date)}</strong>
          <input type="date" className="day-input" value={date}
            onChange={e => e.target.value && setDate(e.target.value)} />
        </div>
        <button className="day-nav" onClick={() => setDate(shiftDate(date, 1))}
          aria-label="Next day">›</button>
        {date !== todayStr() && (
          <button className="day-today" onClick={() => setDate(todayStr())}>Today</button>
        )}
        <button className="day-today" onClick={reload} disabled={loading}>
          {loading ? "…" : "↻"}
        </button>
      </div>

      {/* ── Summary ─────────────────────────────────────────────────── */}
      <div className="day-summary">
        <div><span>Jobs</span><strong>{summary.jobCount}</strong></div>
        <div><span>On site</span><strong>{duration(summary.onSite) || "0m"}</strong></div>
        <div><span>Driving</span><strong>{duration(summary.travel) || "0m"}</strong></div>
        <div className={summary.open >= 45 ? "day-open" : ""}>
          <span>Open time</span><strong>{duration(summary.open) || "0m"}</strong>
        </div>
      </div>

      {noStartPt && (
        <p className="day-warning">
          No starting location on file, so travel times and open time can't be worked out.
          An administrator can set your facility, or you can save your own base location.
        </p>
      )}

      {error && <p className="day-warning">Couldn't load your day: {error}</p>}

      {/* ── Timeline ────────────────────────────────────────────────── */}
      {loading && plan.length === 0 && <p className="day-empty">Working out your day…</p>}

      {!loading && plan.length === 0 && !error && (
        <p className="day-empty">Nothing scheduled. Claim a job from the map to start your day.</p>
      )}

      <ol className="day-timeline">
        {plan.map(row => {
          if (row.kind === "start") {
            return (
              <li key={row.seq} className="day-row day-row-start">
                <div className="day-time">{hhmm(row.arrive_at)}</div>
                <div className="day-body">
                  <strong>Start from {row.title}</strong>
                  {row.note && <p className="day-note">{row.note}</p>}
                </div>
              </li>
            );
          }

          if (row.kind === "gap") {
            const suggestions = fillersByGap.get(row.gap_start) || [];
            return (
              <li key={row.seq} className="day-row day-row-gap">
                <div className="day-time">{hhmm(row.arrive_at)}</div>
                <div className="day-body">
                  <strong>{duration(row.gap_minutes)} open</strong>
                  <span className="day-sub">
                    {hhmm(row.arrive_at)} – {hhmm(row.depart_at)}
                  </span>

                  {suggestions.length > 0 ? (
                    <div className="day-suggestions">
                      <p className="day-suggest-head">Could fill this gap</p>
                      {suggestions.map(s => (
                        <div key={s.appointment_id}
                          className={`day-suggestion${s.fits ? "" : " day-suggestion-tight"}`}>
                          <div className="day-suggest-main">
                            <strong>{s.package_name}</strong>
                            <span className="day-sub">{s.area} · {s.window_label || "flexible"}</span>
                          </div>
                          <div className="day-suggest-meta">
                            <span>{duration(s.service_minutes)} work</span>
                            <span className={s.fits ? "day-detour-ok" : "day-detour-bad"}>
                              +{duration(s.detour_minutes) || "0m"} driving
                            </span>
                          </div>
                          {s.fits ? (
                            <button className="day-claim" disabled={!canClaim}
                              onClick={() => claimSuggestion(s)}>
                              Claim
                            </button>
                          ) : (
                            <span className="day-nofit">Won't fit</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="day-sub">No unclaimed jobs nearby for this window.</p>
                  )}
                </div>
              </li>
            );
          }

          // a job
          return (
            <li key={row.seq} className={`day-row day-row-job${row.note ? " day-row-flag" : ""}`}>
              <div className="day-time">
                {hhmm(row.arrive_at)}
                <span className="day-time-end">{hhmm(row.depart_at)}</span>
              </div>
              <div className="day-body">
                <div className="day-job-head">
                  <strong>{row.title}</strong>
                  {row.status && <span className="day-status">{row.status}</span>}
                </div>
                {row.address && <span className="day-sub">{row.address}</span>}
                <div className="day-job-meta">
                  {row.travel_minutes != null && (
                    <span>{duration(row.travel_minutes)} drive</span>
                  )}
                  <span>{duration(row.service_minutes)} on site</span>
                  {row.window_label && <span>Window {row.window_label}</span>}
                </div>
                {row.phone_number && (
                  <a className="day-phone" href={`tel:${row.phone_number}`}>{row.phone_number}</a>
                )}
                {row.note && <p className="day-note">⚠ {row.note}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
