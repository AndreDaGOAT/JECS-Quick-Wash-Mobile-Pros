
import { useState, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { useJobs } from "./hooks/useJobs";
import { STATUS_COLORS } from "./lib/supabase";
import JobMarker    from "./components/JobMarker";
import FilterPanel  from "./components/FilterPanel";
import MetricsStrip from "./components/MetricsStrip";

// ── Map bounds fitter ─────────────────────────────────────────────────────────
function MapFitter({ jobs }) {
  const map = useMap();
  useMemo(() => {
    if (!jobs.length) return;
    const bounds = jobs.map(j => [j.latitude, j.longitude]);
    // Small delay so tiles load first
    setTimeout(() => {
      try { map.fitBounds(bounds, { padding: [40, 40] }); } catch (_) {}
    }, 100);
  }, [jobs.length > 0 ? jobs.map(j => j.appointment_id).join() : ""]);
  return null;
}

// ── Default filters ───────────────────────────────────────────────────────────
const DEFAULT_FILTERS = {
  status:       "all",
  date:         new Date().toISOString().slice(0, 10),
  zip:          "",
  customer:     "",
  todayOnly:    true,
  showCompleted: false,
};

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const { jobs, loading, isSample, lastUpdated, error, reload, advanceStatus } = useJobs();
  const [filters, setFilters]     = useState(DEFAULT_FILTERS);
  const [toast, setToast]         = useState(null);
  const [sidebarOpen, setSidebar] = useState(true);

  // ── Filter logic ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return jobs.filter(j => {
      if (filters.status !== "all" && j.appointment_status !== filters.status) return false;
      if (filters.zip && !(j.zip_code || "").includes(filters.zip)) return false;
      if (filters.date && !(j.scheduled_start || "").startsWith(filters.date)) return false;
      if (filters.customer && !j.customer_name.toLowerCase().includes(filters.customer.toLowerCase())) return false;
      if (filters.todayOnly && !(j.scheduled_start || "").startsWith(today)) return false;
      if (!filters.showCompleted && j.appointment_status === "Completed") return false;
      return true;
    });
  }, [jobs, filters]);

  // ── Route polyline — active jobs in time order ────────────────────────────
  const routePoints = useMemo(() => {
    return filtered
      .filter(j => !["Completed","Cancelled","Rescheduled"].includes(j.appointment_status))
      .sort((a, b) => (a.scheduled_start || "").localeCompare(b.scheduled_start || ""))
      .map(j => [j.latitude, j.longitude]);
  }, [filtered]);

  // ── Advance status with toast ─────────────────────────────────────────────
  const handleAdvance = useCallback(async (job, newStatus) => {
    try {
      await advanceStatus(job, newStatus);
      showToast(`✓ ${job.customer_name} → ${newStatus}`, "success");
    } catch (err) {
      showToast(`Failed: ${err.message}`, "error");
    }
  }, [advanceStatus]);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Map center — default Memphis ──────────────────────────────────────────
  const mapCenter = useMemo(() => {
    if (filtered.length > 0) return [filtered[0].latitude, filtered[0].longitude];
    return [35.1495, -90.0490];
  }, [filtered.length > 0]);

  return (
    <div className="app-shell">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="pro-header">
        <div className="header-left">
          <button className="sidebar-toggle" onClick={() => setSidebar(v => !v)}
            aria-label="Toggle filter panel">
            {sidebarOpen ? "◀" : "▶"}
          </button>
          <div>
            <p className="eyebrow">Field Operations · JECS Quick Wash</p>
            <h1>Mobile Wash Pro</h1>
          </div>
        </div>
        <div className="header-right">
          {isSample && (
            <span className="sample-badge">Sample Data</span>
          )}
          {error && (
            <span className="error-badge" title={error}>⚠ Offline</span>
          )}
          <button className="btn btn-refresh" onClick={reload} disabled={loading}>
            {loading ? "Loading…" : "↻ Refresh"}
          </button>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="map-workspace">

        {/* Sidebar */}
        {sidebarOpen && (
          <FilterPanel
            filters={filters}
            onChange={setFilters}
            jobCount={filtered.length}
          />
        )}

        {/* Map panel */}
        <div className="map-panel">
          <div className="map-toolbar">
            <span className="toolbar-title">
              {loading ? "Loading jobs…" : `${filtered.length} of ${jobs.length} appointments`}
            </span>
            <div className="toolbar-right">
              <select value={filters.status}
                onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                className="compact-filter">
                <option value="all">All Statuses</option>
                {["Requested","Confirmed","En Route","In Progress","Quality Check","Completed","Cancelled","Rescheduled"]
                  .map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Leaflet map */}
          <MapContainer
            center={mapCenter}
            zoom={12}
            className="job-map"
            zoomControl={true}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />

            {/* Auto-fit bounds when jobs change */}
            <MapFitter jobs={filtered} />

            {/* Job markers */}
            {filtered.map(job => (
              <JobMarker
                key={job.appointment_id}
                job={job}
                onAdvance={handleAdvance}
                isSample={isSample}
              />
            ))}

            {/* Route polyline */}
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

          {/* Metrics strip */}
          <MetricsStrip jobs={jobs} lastUpdated={lastUpdated} />
        </div>
      </div>

      {/* ── Toast notification ────────────────────────────────────────────── */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
      )}
    </div>
  );
}
