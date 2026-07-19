
import { STATUS_COLORS } from "../lib/supabase";

export default function MetricsStrip({ jobs, lastUpdated }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayJobs   = jobs.filter(j => (j.scheduled_start || "").startsWith(today));
  const remaining   = todayJobs.filter(j => !["Completed","Cancelled","Rescheduled"].includes(j.appointment_status));
  const completed   = todayJobs.filter(j => j.appointment_status === "Completed");
  const inProgress  = todayJobs.filter(j => j.appointment_status === "In Progress");
  const driveEst    = remaining.length ? `~${remaining.length * 8 + 5} min` : "0 min";

  const updatedStr = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "—";

  const metrics = [
    { label: "Today's Jobs",  value: todayJobs.length,  color: "#0284C7" },
    { label: "In Progress",   value: inProgress.length, color: "#F59E0B" },
    { label: "Remaining",     value: remaining.length,  color: "#8B5CF6" },
    { label: "Completed",     value: completed.length,  color: "#10B981" },
    { label: "Est. Drive",    value: driveEst,          color: "#D4A843" },
  ];

  return (
    <div className="metrics-strip">
      {metrics.map(m => (
        <div key={m.label} className="metric-item">
          <span className="metric-label">{m.label}</span>
          <strong className="metric-value" style={{ color: m.color }}>{m.value}</strong>
        </div>
      ))}
      <div className="metric-item updated">
        <span className="metric-label">Updated</span>
        <strong className="metric-value">{updatedStr}</strong>
      </div>
    </div>
  );
}
