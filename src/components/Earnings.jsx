import { useMemo } from "react";
import { useEarnings } from "../hooks/useEarnings";
import {
  GRAINS, money, moneyParts, periodLabel, jobsLabel,
  totalFor, averagePerWorkedPeriod,
} from "../lib/earnings";

export default function Earnings({ session }) {
  const { grain, setGrain, totals, periods, balance, loading, error, reload } =
    useEarnings(session);

  const heading = (GRAINS.find(g => g.id === grain) || GRAINS[0]).heading;
  const current = totalFor(totals, grain);
  const parts   = moneyParts(current.cents);
  const average = useMemo(() => averagePerWorkedPeriod(periods), [periods]);

  // Bars are drawn against the biggest period on screen, so the shape of the
  // run is readable even when the amounts are small.
  const peak = useMemo(
    () => Math.max(1, ...periods.map(r => r.amount_cents || 0)),
    [periods]
  );

  const worked = periods.filter(r => (r.job_count || 0) > 0).length;

  // The series stops at this Wash Pro's first job, so it can be shorter than
  // asked for — down to a single period for someone who started this year.
  const plural = { day: "days", week: "weeks", month: "months", year: "years" }[grain];
  const rangeLabel = periods.length <= 1
    ? "So far"
    : `Last ${periods.length} ${plural}`;

  return (
    <div className="earn">
      {/* Day / Week / Month / Year */}
      <div className="earn-grains" role="tablist" aria-label="Earnings period">
        {GRAINS.map(g => (
          <button key={g.id} type="button" role="tab"
            aria-selected={grain === g.id}
            className={grain === g.id ? "active" : ""}
            onClick={() => setGrain(g.id)}>
            {g.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="earn-error">
          <strong>Couldn’t load your earnings.</strong>
          <span>{error}</span>
          <button type="button" onClick={reload}>Try again</button>
        </div>
      )}

      {/* The headline figure for the selected period */}
      <div className="earn-hero">
        <div className="earn-hero-label">{heading}</div>
        <div className="earn-hero-amount" aria-label={money(current.cents)}>
          <span className="earn-hero-sign">{parts.sign}$</span>
          <span className="earn-hero-whole">{parts.whole}</span>
          <span className="earn-hero-frac">.{parts.frac}</span>
        </div>
        <div className="earn-hero-sub">
          {loading && !totals ? "Loading…" : jobsLabel(current.jobs)}
          {totals && current.jobs > 0 && (
            <> · {money(Math.round(current.cents / current.jobs))} a job</>
          )}
        </div>
      </div>

      {/* What is actually payable right now */}
      {balance && (
        <div className="earn-balance">
          <div className="earn-balance-row">
            <div>
              <div className="earn-balance-label">Payable now</div>
              <div className="earn-balance-value">{money(balance.available_cents)}</div>
            </div>
            <div>
              <div className="earn-balance-label">Clearing</div>
              <div className="earn-balance-value muted">{money(balance.pending_cents)}</div>
            </div>
            <div>
              <div className="earn-balance-label">Paid out</div>
              <div className="earn-balance-value muted">{money(balance.paid_cents)}</div>
            </div>
          </div>
          {balance.blocked_reason && (
            <div className="earn-balance-note">{balance.blocked_reason}</div>
          )}
        </div>
      )}

      {/* The run of periods */}
      <div className="earn-card">
        <div className="earn-card-head">
          <span>{rangeLabel}</span>
          {/* An average over a single period is just that period again. */}
          {average != null && worked > 1 && (
            <span className="earn-card-note">
              {money(average)} per {grain} worked
            </span>
          )}
        </div>

        {loading && periods.length === 0 && (
          <div className="earn-empty">Loading…</div>
        )}

        {!loading && periods.length > 0 && worked === 0 && (
          <div className="earn-empty">
            No earnings in this stretch yet. Completed jobs show up here once
            payment is captured.
          </div>
        )}

        {periods.length > 0 && worked > 0 && (
          <>
            {/* Bars earn their place only once there is a run to compare. */}
            {periods.length >= 3 && (
            <div className="earn-chart" aria-hidden="true">
              {[...periods].reverse().map(r => (
                <div key={r.period_start} className="earn-bar-slot"
                  title={`${r.period_label}: ${money(r.amount_cents)}`}>
                  <div
                    className={"earn-bar" + ((r.job_count || 0) === 0 ? " empty" : "")}
                    style={{ height: `${Math.round(((r.amount_cents || 0) / peak) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
            )}

            <ul className="earn-list">
              {periods.map(r => {
                const label = periodLabel(r, grain, totals?.as_of);
                const quiet = (r.job_count || 0) === 0;
                return (
                  <li key={r.period_start} className={quiet ? "quiet" : ""}>
                    <div className="earn-list-main">
                      <span className="earn-list-label">{label}</span>
                      <span className="earn-list-sub">
                        {quiet ? "No jobs" : jobsLabel(r.job_count)}
                        {r.tip_cents > 0 && <> · {money(r.tip_cents)} tips</>}
                      </span>
                    </div>
                    <div className="earn-list-amounts">
                      <span className="earn-list-amount">{money(r.amount_cents)}</span>
                      {!quiet && r.pending_cents > 0 && (
                        <span className="earn-list-pending">
                          {money(r.pending_cents)} clearing
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {totals && (
        <div className="earn-lifetime">
          {money(totals.lifetime_cents)} earned across {jobsLabel(totals.lifetime_jobs)}
          {totals.year_cents !== totals.lifetime_cents && (
            <> · {money(totals.year_cents)} this year</>
          )}
        </div>
      )}
    </div>
  );
}
