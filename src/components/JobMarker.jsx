import { useState } from "react";
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { STATUS_COLORS, STATUS_PIPELINE, nextStatus } from "../lib/supabase";

function markerIcon(status, isClaimable) {
  const color = isClaimable
    ? "#F59E0B"  // Gold pulse for claimable requests
    : STATUS_COLORS[status] || STATUS_COLORS["Requested"];

  const pulse = isClaimable
    ? `box-shadow:0 0 0 4px ${color}44,0 0 0 8px ${color}22;`
    : "";

  return L.divIcon({
    className: "",
    html: `<span style="
      display:block;width:${isClaimable ? 22 : 18}px;height:${isClaimable ? 22 : 18}px;
      border-radius:50%;background:${color};
      border:3px solid #fff;${pulse}
      box-shadow:0 3px 10px rgba(0,0,0,0.35);">
    </span>`,
    iconSize:    isClaimable ? [22, 22] : [18, 18],
    iconAnchor:  isClaimable ? [11, 11] : [9, 9],
    popupAnchor: [0, -14],
  });
}

function formatTime(iso) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric",
  }).format(new Date(iso));
}

export default function JobMarker({ job, onAdvance, onClaim, isSample }) {
  const [claiming, setClaiming] = useState(false);
  const [claimErr, setClaimErr] = useState("");

  const next      = nextStatus(job.appointment_status);
  const color     = job.is_claimable
    ? "#F59E0B"
    : STATUS_COLORS[job.appointment_status] || "#999";
  const mapsUrl   = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.formatted_address)}`;
  const pipelineIdx = STATUS_PIPELINE.indexOf(job.appointment_status);

  async function handleClaim() {
    setClaiming(true);
    setClaimErr("");
    try {
      await onClaim(job);
    } catch (err) {
      setClaimErr(err.message || "Could not claim — try again.");
      setClaiming(false);
    }
  }

  return (
    <Marker
      position={[job.latitude, job.longitude]}
      icon={markerIcon(job.appointment_status, job.is_claimable)}
      title={job.is_claimable ? "Available — tap to claim" : job.customer_name}
      zIndexOffset={job.is_claimable ? 1000 : 0}
    >
      <Popup maxWidth={340} minWidth={280}>
        <div className="job-popup">

          {/* ── Header ──────────────────────────────────────────── */}
          <div className="popup-header">
            <div>
              {job.is_claimable && (
                <div className="popup-claim-badge">⚡ Available Job</div>
              )}
              <div className="popup-name">
                {job.is_claimable ? job.customer_notes || "New Wash Request" : job.customer_name}
              </div>
              {job.service_request_number && (
                <div className="popup-srn">{job.service_request_number}</div>
              )}
            </div>
            <span className="popup-badge"
              style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
              {job.appointment_status}
            </span>
          </div>

          {/* ── Pipeline progress (assigned jobs only) ───────────── */}
          {!job.is_claimable && (
            <div className="popup-pipeline">
              {STATUS_PIPELINE.map((s, i) => (
                <div key={s} className="pipeline-dot" title={s}
                  style={{
                    background: i <= pipelineIdx
                      ? STATUS_COLORS[STATUS_PIPELINE[i]]
                      : "#e2e8f0",
                    opacity: i === pipelineIdx ? 1 : i < pipelineIdx ? 0.7 : 0.3,
                  }}
                />
              ))}
            </div>
          )}

          {/* ── Details ─────────────────────────────────────────── */}
          <dl className="popup-dl">
            {/* Claimable: show zone/date info, hide personal details */}
            {job.is_claimable ? (
              <>
                <div><dt>Zone</dt><dd>{job.zip_code || "—"}</dd></div>
                <div><dt>Requested</dt><dd>{formatDate(job.scheduled_start)}</dd></div>
                {job.cluster_key && <div><dt>Cluster</dt><dd>{job.cluster_key}</dd></div>}
                {job.customer_notes && (
                  <div><dt>Notes</dt>
                    <dd style={{ color: "#F59E0B" }}>{job.customer_notes}</dd>
                  </div>
                )}
                <div>
                  <dt>Details</dt>
                  <dd style={{ color: "#7A90B0", fontStyle: "italic" }}>
                    Revealed after claiming
                  </dd>
                </div>
              </>
            ) : (
              <>
                <div><dt>Time</dt>
                  <dd>{formatTime(job.scheduled_start)}
                    {job.preferred_time_window ? ` · ${job.preferred_time_window}` : ""}
                  </dd>
                </div>
                <div><dt>Address</dt><dd>{job.formatted_address || "—"}</dd></div>
                {job.phone_number && (
                  <div><dt>Phone</dt><dd>{job.phone_number}</dd></div>
                )}
                {job.email && (
                  <div><dt>Email</dt><dd>{job.email}</dd></div>
                )}
                <div><dt>Vehicle</dt><dd>{job.vehicle_type}</dd></div>
                {job.license_plate !== "—" && (
                  <div><dt>Plate</dt>
                    <dd style={{ fontWeight: 700, color: "#D4A843" }}>{job.license_plate}</dd>
                  </div>
                )}
                {job.weather_score != null && (
                  <div><dt>Weather</dt>
                    <dd style={{
                      color: job.weather_score >= 75 ? "#10B981"
                           : job.weather_score >= 45 ? "#F59E0B" : "#EF4444",
                      fontWeight: 700,
                    }}>{job.weather_score}/100</dd>
                  </div>
                )}
                {job.customer_notes && (
                  <div><dt>Notes</dt>
                    <dd style={{ color: "#F59E0B" }}>{job.customer_notes}</dd>
                  </div>
                )}
              </>
            )}
          </dl>

          {/* ── Claim error ──────────────────────────────────────── */}
          {claimErr && (
            <div className="claim-error">⚠ {claimErr}</div>
          )}

          {/* ── Actions ─────────────────────────────────────────── */}
          <div className="popup-actions">
            {job.is_claimable ? (
              /* ── CLAIM CTA ── */
              <button
                className="pop-btn claim-btn"
                onClick={handleClaim}
                disabled={claiming || isSample}>
                {claiming ? "Claiming…" : "⚡ Claim This Job"}
              </button>
            ) : (
              /* ── ADVANCE STATUS ── */
              <>
                <a className="pop-btn nav-btn" href={mapsUrl}
                  target="_blank" rel="noreferrer">
                  📍 Navigate
                </a>
                {next && (
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
                {job.email && (
                  <a className="pop-btn email-btn" href={`mailto:${job.email}`}>
                    ✉ Email
                  </a>
                )}
              </>
            )}
          </div>

          {isSample && (
            <p className="sample-note">
              {job.is_claimable
                ? "Sample — real jobs appear after login"
                : "Sample data — connect Supabase for live jobs"}
            </p>
          )}
        </div>
      </Popup>
    </Marker>
  );
}
