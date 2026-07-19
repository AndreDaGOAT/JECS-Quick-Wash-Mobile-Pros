
import { STATUS_PIPELINE } from "../lib/supabase";

export default function FilterPanel({ filters, onChange, jobCount }) {
  const set = (key, val) => onChange({ ...filters, [key]: val });

  const STATUS_OPTIONS = [
    ...STATUS_PIPELINE,
    "Cancelled",
    "Rescheduled",
  ];

  const LEGEND = [
    { label: "Requested",     color: "#7A90B0" },
    { label: "Confirmed",     color: "#0284C7" },
    { label: "En Route",      color: "#8B5CF6" },
    { label: "In Progress",   color: "#F59E0B" },
    { label: "Quality Check", color: "#D4A843" },
    { label: "Completed",     color: "#10B981" },
    { label: "Cancelled",     color: "#EF4444" },
    { label: "Rescheduled",   color: "#6B7280" },
  ];

  return (
    <aside className="filter-panel">
      <div className="panel-heading">
        <h2>Filters</h2>
        <span className="job-count">{jobCount} job{jobCount !== 1 ? "s" : ""} on map</span>
      </div>

      <div className="filter-group">
        <label htmlFor="statusFilter">Status</label>
        <select id="statusFilter" value={filters.status}
          onChange={e => set("status", e.target.value)}>
          <option value="all">All Statuses</option>
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <label htmlFor="dateFilter">Date</label>
        <input id="dateFilter" type="date" value={filters.date}
          onChange={e => set("date", e.target.value)} />
      </div>

      <div className="filter-group">
        <label htmlFor="zipFilter">ZIP Code</label>
        <input id="zipFilter" type="search" placeholder="e.g. 38103"
          inputMode="numeric" value={filters.zip}
          onChange={e => set("zip", e.target.value)} />
      </div>

      <div className="filter-group">
        <label htmlFor="customerFilter">Customer</label>
        <input id="customerFilter" type="search" placeholder="Search name…"
          value={filters.customer}
          onChange={e => set("customer", e.target.value)} />
      </div>

      <div className="toggle-group">
        <label className="check-row">
          <input type="checkbox" checked={filters.todayOnly}
            onChange={e => set("todayOnly", e.target.checked)} />
          <span>Today's Jobs Only</span>
        </label>
        <label className="check-row">
          <input type="checkbox" checked={filters.showCompleted}
            onChange={e => set("showCompleted", e.target.checked)} />
          <span>Show Completed</span>
        </label>
      </div>

      <div className="legend">
        <h3>Status Colors</h3>
        {LEGEND.map(({ label, color }) => (
          <button key={label} className="legend-row"
            onClick={() => set("status", filters.status === label ? "all" : label)}
            style={{ background: filters.status === label ? `${color}15` : "transparent" }}>
            <span className="dot" style={{ background: color }} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
