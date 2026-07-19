
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { STATUS_COLORS, STATUS_PIPELINE, nextStatus } from "../lib/supabase";

function markerIcon(status) {
  const color = STATUS_COLORS[status] || STATUS_COLORS["Requested"];
  return L.divIcon({
    className: "",
    html: `<span style="
      display:block;width:18px;height:18px;border-radius:50%;
      background:${color};border:3px solid #fff;
      box-shadow:0 3px 10px rgba(0,0,0,0.35);">
    </span>`,
    iconSize:    [18, 18],
    iconAnchor:  [9, 9],
    popupAnchor: [0, -14],
  });
}

function formatTime(iso) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}

export default function JobMarker({ job, onAdvance, isSample }) {
  const next    = nextStatus(job.appointment_status);
  const color   = STATUS_COLORS[job.appointment_status] || "#999";
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.formatted_address)}`;

  const pipelineIdx = STATUS_PIPELINE.indexOf(job.appointment_status);

  return (
    <Marker
      position={[job.latitude, job.longitude]}
      icon={markerIcon(job.appointment_status)}
      title={job.customer_name}
    >
      <Popup maxWidth={340} minWidth={280}>
        <div className="job-popup">
          {/* Header */}
          <div className="popup-header">
            <div className="popup-name">{job.customer_name}</div>
            <span className="popup-badge"
              style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
              {job.appointment_status}
            </span>
          </div>

          {/* Pipeline progress bar */}
          <div className="popup-pipeline">
            {STATUS_PIPELINE.map((s, i) => (
              <div key={s}
                className="pipeline-dot"
                title={s}
                style={{
                  background: i <= pipelineIdx ? STATUS_COLORS[STATUS_PIPELINE[i]] : "#e2e8f0",
                  opacity: i === pipelineIdx ? 1 : i < pipelineIdx ? 0.7 : 0.3,
                }}
              />
            ))}
          </div>

          {/* Details */}
          <dl className="popup-dl">
            <div><dt>Time</dt>
              <dd>{formatTime(job.scheduled_start)}{job.preferred_time_window ? ` · ${job.preferred_time_window}` : ""}</dd>
            </div>
            <div><dt>Address</dt><dd>{job.formatted_address || "—"}</dd></div>
            {job.phone_number && <div><dt>Phone</dt><dd>{job.phone_number}</dd></div>}
            <div><dt>Vehicle</dt><dd>{job.vehicle_type}</dd></div>
            <div><dt>Plate</dt><dd style={{ fontWeight: 700, color: "#D4A843" }}>{job.license_plate}</dd></div>
            {job.weather_score != null && (
              <div><dt>Weather</dt>
                <dd>
                  <span style={{
                    color: job.weather_score >= 75 ? "#10B981" : job.weather_score >= 45 ? "#F59E0B" : "#EF4444",
                    fontWeight: 700,
                  }}>
                    {job.weather_score}/100
                  </span>
                </dd>
              </div>
            )}
            {job.customer_notes && (
              <div><dt>Notes</dt><dd style={{ color: "#F59E0B" }}>{job.customer_notes}</dd></div>
            )}
          </dl>

          {/* Actions */}
          <div className="popup-actions">
            <a className="pop-btn nav-btn" href={mapsUrl} target="_blank" rel="noreferrer">
              📍 Navigate
            </a>
            {next && !isSample && (
              <button
                className="pop-btn advance-btn"
                onClick={() => onAdvance(job, next)}
                style={{ background: STATUS_COLORS[next] }}>
                → {next}
              </button>
            )}
            {job.phone_number && (
              <a className="pop-btn phone-btn" href={`tel:${job.phone_number}`}>
                📞 Call
              </a>
            )}
          </div>

          {isSample && (
            <p className="sample-note">Sample data — connect Supabase for live jobs</p>
          )}
        </div>
      </Popup>
    </Marker>
  );
}
