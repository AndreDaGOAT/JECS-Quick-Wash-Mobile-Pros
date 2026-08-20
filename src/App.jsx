import { useState, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { useAuth }        from "./hooks/useAuth";
import { useJobs }        from "./hooks/useJobs";
import { STATUS_COLORS }  from "./lib/supabase";
import LoginScreen  from "./components/LoginScreen";
import JobMarker    from "./components/JobMarker";
import FilterPanel  from "./components/FilterPanel";
import MetricsStrip from "./components/MetricsStrip";

// ── Map auto-fitter ───────────────────────────────────────────────────────────
function MapFitter({ jobs }) {
  const map = useMap();
  useMemo(() => {
    if (!jobs.length) return;
    setTimeout(() => {
      try {
        map.fitBounds(
          jobs.map(j => [j.latitude, j.longitude]),
          { padding: [40, 40] }
        );
      } catch (_) {}
    }, 100);
  }, [jobs.length > 0 ? jobs.map(j => j.appointment_id).join() : ""]);
  return null;
}

// ── Default filters ───────────────────────────────────────────────────────────
const DEFAULT_FILTERS = {
  status:        "all",
  date:          new Date().toISOString().slice(0, 10),
  zip:           "",
  customer:      "",
  todayOnly:     true,
  showCompleted: false,
  showClaimable: true,   // show pending/claimable requests
};

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const auth = useAuth();
  const {
    jobs, washPro, loading: jobsLoading,
    isSample, lastUpdated, error,
    reload, claimJob, advanceStatus,
  } = useJobs(auth.session, auth.profile);

  const [filters,     setFilters] = useState(DEFAULT_FILTERS);
  const [toast,       setToast]   = useState(null);
  const [sidebarOpen, setSidebar] = useState(true);

  // ── Splash screen while restoring session ─────────────────────────────────
  if (auth.loading) {
    return (
      <div className="splash">
        <div className="splash-logo">
          <span className="logo-jecs">JECS</span>
          <span className="logo-sub">Quick Wash</span>
        </div>
        <div className="splash-loading">Restoring session…</div>
      </div>
    );
  }

  // ── Login screen ──────────────────────────────────────────────────────────
  if (!auth.isAuthenticated) {
    return (
      <LoginScreen
        onLogin={auth.login}
        loading={auth.loading}
        error={auth.error}
      />
    );
  }

  // ── Wash Pro profile warning ──────────────────────────────────────────────
  // Show a non-blocking warning if the tech has no wash_pro_profiles row
  // They can still see the map but can't claim jobs
  const canClaim = washPro?.onboarding_status === "approved" && washPro?.active === true;

  // ── Filter jobs ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return jobs.filter(j => {
      if (!filters.showClaimable && j.is_claimable) return false;
      if (filters.status !== "all" && j.appointment_status !== filters.status) return false;
      if (filters.zip && !(j.zip_code || "").includes(filters.zip)) return false;
      if (filters.date && !(j.scheduled_start || "").startsWith(filters.date)) return false;
      if (filters.customer && !j.customer_name.toLowerCase().includes(filters.customer.toLowerCase())) return false;
      if (filters.todayOnly && !(j.scheduled_start || "").startsWith(today)) return false;
      if (!filters.showCompleted && j.appointment_status === "Completed") return false;
      return true;
    });
  }, [jobs, filters]);

  // Route: only through confirmed/active assigned jobs
  const routePoints = useMemo(() => (
    filtered
      .filter(j => !j.is_claimable && !["Completed","Cancelled","Rescheduled"].includes(j.appointment_status))
      .sort((a, b) => (a.scheduled_start || "").localeCompare(b.scheduled_start || ""))
      .map(j => [j.latitude, j.longitude])
  ), [filtered]);

  const mapCenter = filtered.length > 0
    ? [filtered[0].latitude, filtered[0].longitude]
    : [35.1495, -90.0490];

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Advance status ────────────────────────────────────────────────────────
  async function handleAdvance(job, newStatus) {
    try {
      await advanceStatus(job, newStatus);
      showToast(`✓ ${job.customer_name} → ${newStatus}`);
    } catch (err) {
      showToast(`Failed: ${err.message}`, "error");
    }
  }

  // ── Claim job ─────────────────────────────────────────────────────────────
  async function handleClaim(job) {
    if (!canClaim && !isSample) {
      showToast("Your account must be approved before claiming jobs.", "error");
      return;
    }
    try {
      await claimJob(job);
      showToast(`🎉 Job claimed! Check your assigned jobs.`);
    } catch (err) {
      showToast(err.message || "Could not claim — try again.", "error");
      throw err; // re-throw so JobMarker can show inline error
    }
  }

  // ── Counts for map legend ─────────────────────────────────────────────────
  const claimableCount = filtered.filter(j => j.is_claimable).length;
  const myJobsCount    = filtered.filter(j => !j.is_claimable).length;

  return (
    <div className="app-shell">

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="pro-header">
        <div className="header-left">
          <button className="sidebar-toggle"
            onClick={() => setSidebar(v => !v)}
            aria-label="Toggle filters">
            {sidebarOpen ? "◀" : "▶"}
          </button>
          <div>
            <p className="eyebrow">Field Operations · JECS Quick Wash</p>
            <h1>Mobile Wash Pro</h1>
          </div>
        </div>

        <div className="header-right">
          {isSample && <span className="sample-badge">Sample Data</span>}
          {!canClaim && !isSample && (
            <span className="warn-badge" title="Complete onboarding to claim jobs">
              ⚠ Pending Approval
            </span>
          )}

          {/* Availability counts */}
          {claimableCount > 0 && (
            <span className="available-badge">
              ⚡ {claimableCount} Available
            </span>
          )}

          {/* User chip */}
          <div className="user-chip">
            <span className="user-avatar">
              {(auth.profile?.full_name || auth.profile?.email || "?")[0].toUpperCase()}
            </span>
            <span className="user-name">
              {auth.profile?.full_name || auth.profile?.email}
            </span>
            <span className="user-role">
              {washPro?.worker_type === "independent_contractor" ? "Contractor" : auth.profile?.role}
            </span>
          </div>

          <button className="btn-refresh" onClick={reload} disabled={jobsLoading}>
            {jobsLoading ? "Loading…" : "↻ Refresh"}
          </button>
          <button className="btn-signout" onClick={auth.logout}>Sign Out</button>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div className="map-workspace">
        {sidebarOpen && (
          <FilterPanel
            filters={filters}
            onChange={setFilters}
            jobCount={filtered.length}
            claimableCount={claimableCount}
            myJobsCount={myJobsCount}
          />
        )}

        <div className="map-panel">
          <div className="map-toolbar">
            <span className="toolbar-title">
              {jobsLoading
                ? "Loading jobs…"
                : `${claimableCount} available · ${myJobsCount} assigned`}
            </span>
            <div className="toolbar-right">
              <select
                value={filters.status}
                onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                className="compact-filter">
                <option value="all">All Statuses</option>
                <option value="Pending">Pending (Claimable)</option>
                {["Requested","Confirmed","En Route","In Progress","Quality Check","Completed","Cancelled"]
                  .map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <MapContainer center={mapCenter} zoom={12} className="job-map">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            <MapFitter jobs={filtered} />

            {filtered.map(job => (
              <JobMarker
                key={job.appointment_id}
                job={job}
                onAdvance={handleAdvance}
                onClaim={handleClaim}
                isSample={isSample}
              />
            ))}

            {routePoints.length > 1 && (
              <Polyline
                positions={routePoints}
                color="#0284C7"
                weight={3}
                opacity={0.7}
                dashArray="8 10"
              />
            )}
          </MapContainer>

          <MetricsStrip jobs={jobs} lastUpdated={lastUpdated} />
        </div>
      </div>

      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
      )}
    </div>
  );
}
