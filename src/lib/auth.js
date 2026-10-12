/* ── JECS Mobile Wash Pro · script.js ─────────────────────────────────────────
   Pulls live data from Supabase:
     appointments → customers (lat/lng, address, name, zip)
                  → service_requests → vehicles (vehicle_type, license_plate)
   Falls back to sample data if Supabase is unreachable.
   ──────────────────────────────────────────────────────────────────────────── */

const SB_URL = "https://mylqkbpclcrqorjctjxn.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bHFrYnBjbGNycW9yamN0anhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjcxNzgsImV4cCI6MjA5NTMwMzE3OH0.yeZZHm0BEvrJShe8Wek5rfKAwunJQ8byKF1THbtwYYg";

// ── Auth token — pulled from Supabase session in localStorage ─────────────────
// The Supabase JS client stores the session under sb-<project>-auth-token
function getAuthToken() {
  try {
    const key = Object.keys(localStorage).find(k => k.startsWith("sb-") && k.endsWith("-auth-token"));
    if (!key) return null;
    const session = JSON.parse(localStorage.getItem(key));
    return session?.access_token || null;
  } catch (_) { return null; }
}

// ── Status colours — mirrors admin dashboard ──────────────────────────────────
const STATUS_COLORS = {
  "Requested":     "#7A90B0",
  "Confirmed":     "#0284C7",
  "En Route":      "#8B5CF6",
  "In Progress":   "#F59E0B",
  "Quality Check": "#D4A843",
  "Completed":     "#10B981",
  "Cancelled":     "#EF4444",
  "Rescheduled":   "#6B7280",
};

// Pipeline order for advance-status button
const PIPELINE = ["Requested","Confirmed","En Route","In Progress","Quality Check","Completed"];

// ── Supabase fetch helper ─────────────────────────────────────────────────────
async function sbFetch(path, token) {
  const authToken = token || getAuthToken() || SB_KEY;
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const txt = await res.text();
  return txt ? JSON.parse(txt) : [];
}

async function sbPatch(path, body) {
  const token = getAuthToken() || SB_KEY;
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${res.status}`);
}

// Call a Supabase RPC (POST /rest/v1/rpc/<fn>) with the auth token
async function sbRpc(fn, params = {}) {
  const token = getAuthToken() || SB_KEY;
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Supabase RPC ${fn} ${res.status}: ${await res.text()}`);
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

// ── Load claimable (Requested, unassigned) appointments via territory RPC ─────
async function loadClaimableJobs() {
  try {
    const rows = await sbRpc("fetch_claimable_appointments");
    return (rows || []).map(a => ({
      appointment_id:         a.appointment_id,
      service_request_id:     a.service_request_id,
      assigned_employee_id:   null,
      appointment_status:     "Requested",
      is_claimable:           true,
      scheduled_start:        a.scheduled_start        || null,
      preferred_time_window:  a.preferred_time_window  || null,
      customer_notes:         a.customer_notes         || null,
      service_request_number: a.service_request_number || "—",
      customer_name:          a.customer_name          || "New Request",
      formatted_address:      a.formatted_address      || "",
      latitude:               parseFloat(a.latitude)   || null,
      longitude:              parseFloat(a.longitude)  || null,
      zip_code:               a.zip_code               || "",
      vehicle_type:           a.vehicle_type           || "—",
      license_plate:          a.license_plate          || "—",
    })).filter(j => j.latitude && j.longitude);
  } catch (err) {
    console.warn("[JECS] Could not load claimable jobs:", err.message);
    return [];
  }
}

// ── Load jobs from Supabase ───────────────────────────────────────────────────
async function loadJobs() {
  const token = getAuthToken() || SB_KEY;
  // Fetch assigned appointments + customer location/name
  const appts = await sbFetch(
    `appointments?select=*,customers(full_name,formatted_address,latitude,longitude,zip_code)&appointment_status=neq.Requested&order=scheduled_start.asc&limit=300`,
    token
  );

  // Enrich each appointment with vehicle data
  const jobs = await Promise.all(appts.map(async (a) => {
    let vehicleType  = null;
    let licensePlate = null;

    // appointments → service_requests → vehicles
    if (a.service_request_id) {
      try {
        const srs = await sbFetch(`service_requests?request_id=eq.${a.service_request_id}&select=vehicle_id&limit=1`);
        const vid = srs?.[0]?.vehicle_id;
        if (vid) {
          const vehs = await sbFetch(`vehicles?vehicle_id=eq.${vid}&select=vehicle_type,license_plate&limit=1`);
          vehicleType  = vehs?.[0]?.vehicle_type  || null;
          licensePlate = vehs?.[0]?.license_plate || null;
        }
      } catch (_) {}
    }

    // Fallback by customer_id
    if (!vehicleType && a.customer_id) {
      try {
        const vehs = await sbFetch(`vehicles?customer_id=eq.${a.customer_id}&select=vehicle_type,license_plate&order=created_at.desc&limit=1`);
        vehicleType  = vehs?.[0]?.vehicle_type  || null;
        licensePlate = vehs?.[0]?.license_plate || null;
      } catch (_) {}
    }

    const cust = a.customers || {};
    return {
      appointment_id:         a.appointment_id,
      service_request_id:     a.service_request_id,
      assigned_employee_id:   a.assigned_employee_id,
      appointment_status:     a.appointment_status || "Requested",
      scheduled_start:        a.scheduled_start,
      scheduled_end:          a.scheduled_end,
      preferred_time_window:  a.preferred_time_window,
      customer_notes:         a.customer_notes,
      customer_name:          cust.full_name        || "Unknown Customer",
      formatted_address:      cust.formatted_address || "",
      latitude:               parseFloat(cust.latitude)  || null,
      longitude:              parseFloat(cust.longitude) || null,
      zip_code:               cust.zip_code         || "",
      vehicle_type:           vehicleType           || "—",
      license_plate:          licensePlate          || "—",
    };
  }));

  return jobs.filter(j => j.latitude && j.longitude);
}

// ── Sample fallback data (Memphis coordinates) ────────────────────────────────
const SAMPLE_JOBS = [
  { appointment_id:"sample-1", appointment_status:"Confirmed",   customer_name:"James Carter",  formatted_address:"1234 Poplar Ave, Memphis, TN 38104", latitude:35.1494, longitude:-90.0490, zip_code:"38104", scheduled_start:"2026-07-17T08:00:00", vehicle_type:"2022 Black Toyota Camry", license_plate:"TN-ABC123" },
  { appointment_id:"sample-2", appointment_status:"En Route",    customer_name:"Maria Gonzalez",formatted_address:"789 Union Ave, Memphis, TN 38103",   latitude:35.1456, longitude:-90.0520, zip_code:"38103", scheduled_start:"2026-07-17T10:00:00", vehicle_type:"2020 White Honda CRV",   license_plate:"TN-XYZ456" },
  { appointment_id:"sample-3", appointment_status:"In Progress", customer_name:"DeShawn Brown", formatted_address:"456 Madison Ave, Memphis, TN 38103",  latitude:35.1470, longitude:-90.0480, zip_code:"38103", scheduled_start:"2026-07-17T12:00:00", vehicle_type:"2019 Silver Ford F-150", license_plate:"TN-DEF789" },
  { appointment_id:"sample-4", appointment_status:"Requested",   customer_name:"Angela White",  formatted_address:"321 Beale St, Memphis, TN 38103",    latitude:35.1398, longitude:-90.0503, zip_code:"38103", scheduled_start:"2026-07-17T14:00:00", vehicle_type:"2023 Blue Kia Soul",    license_plate:"TN-GHI012" },
  { appointment_id:"sample-5", appointment_status:"Completed",   customer_name:"Robert Kim",    formatted_address:"555 Peabody Pl, Memphis, TN 38103",  latitude:35.1420, longitude:-90.0540, zip_code:"38103", scheduled_start:"2026-07-17T06:30:00", vehicle_type:"2021 Red Jeep Wrangler",license_plate:"TN-JKL345" },
];

// ── Map setup ─────────────────────────────────────────────────────────────────
const map = L.map("jobMap", { zoomControl: true }).setView([35.1495, -90.0490], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
let routeLine = L.polyline([], { color: "#0284C7", weight: 4, opacity: 0.75, dashArray: "8 10" }).addTo(map);

// ── State ─────────────────────────────────────────────────────────────────────
let allJobs = [];
let isSampleData = false;

// ── Elements ──────────────────────────────────────────────────────────────────
const el = {
  statusFilter:        document.getElementById("statusFilter"),
  compactStatusFilter: document.getElementById("compactStatusFilter"),
  zipFilter:           document.getElementById("zipFilter"),
  dateFilter:          document.getElementById("dateFilter"),
  customerFilter:      document.getElementById("customerFilter"),
  todayOnlyFilter:     document.getElementById("todayOnlyFilter"),
  myJobsFilter:        document.getElementById("myJobsFilter"),
  todayJobsCount:      document.getElementById("todayJobsCount"),
  remainingJobsCount:  document.getElementById("remainingJobsCount"),
  completedJobsCount:  document.getElementById("completedJobsCount"),
  driveTime:           document.getElementById("driveTime"),
  refreshButton:       document.getElementById("refreshButton"),
  lastUpdated:         document.getElementById("lastUpdated"),
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(iso) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function markerIcon(status) {
  const color = STATUS_COLORS[status] || STATUS_COLORS["Requested"];
  return L.divIcon({
    className: "",
    html: `<span class="status-marker" style="background:${color}"></span>`,
    iconSize:    [18, 18],
    iconAnchor:  [9, 9],
    popupAnchor: [0, -12],
  });
}

function statusBadge(status) {
  const color = STATUS_COLORS[status] || "#999";
  return `<span class="status-badge" style="background:${color}22;color:${color};border:1px solid ${color}44">${status}</span>`;
}

function mapsLink(address) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

function nextStatus(current) {
  const idx = PIPELINE.indexOf(current);
  return idx >= 0 && idx < PIPELINE.length - 1 ? PIPELINE[idx + 1] : null;
}

// ── Popup template ────────────────────────────────────────────────────────────
function buildPopup(job) {
  const next = nextStatus(job.appointment_status);
  return `
    <div class="job-popup">
      <h3>${job.customer_name}</h3>
      <dl>
        <div class="dl-row"><dt>Status</dt><dd>${statusBadge(job.appointment_status)}</dd></div>
        <div class="dl-row"><dt>Time</dt><dd>${formatTime(job.scheduled_start)}${job.preferred_time_window ? ` (${job.preferred_time_window})` : ""}</dd></div>
        <div class="dl-row"><dt>Address</dt><dd>${job.formatted_address || "—"}</dd></div>
        <div class="dl-row"><dt>Vehicle</dt><dd>${job.vehicle_type}</dd></div>
        <div class="dl-row"><dt>Plate</dt><dd>${job.license_plate}</dd></div>
        ${job.customer_notes ? `<div class="dl-row"><dt>Notes</dt><dd style="color:#F59E0B">${job.customer_notes}</dd></div>` : ""}
      </dl>
      <div class="popup-actions">
        <a class="btn-action" href="${mapsLink(job.formatted_address)}" target="_blank" rel="noreferrer">📍 Navigate</a>
        ${job.is_claimable && !isSampleData
          ? `<button class="btn-action claim" type="button" data-appt="${job.appointment_id}" data-sr="${job.service_request_id || ""}" style="background:#10B981;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-weight:600">✅ Claim Job</button>`
          : next && !isSampleData
            ? `<button class="btn-action advance" type="button" data-appt="${job.appointment_id}" data-sr="${job.service_request_id || ""}" data-next="${next}">→ ${next}</button>`
            : ""}
        ${isSampleData ? `<span style="font-size:11px;color:#999;margin-top:4px">Sample data — connect Supabase for live updates</span>` : ""}
      </div>
    </div>`;
}

// ── Filter ────────────────────────────────────────────────────────────────────
function getFiltered() {
  const status   = el.statusFilter.value;
  const zip      = el.zipFilter.value.trim();
  const date     = el.dateFilter.value;
  const customer = el.customerFilter.value.trim().toLowerCase();
  const today    = todayStr();

  return allJobs.filter(j => {
    if (status !== "all" && j.appointment_status !== status) return false;
    if (zip && !(j.zip_code || "").includes(zip)) return false;
    if (date && !(j.scheduled_start || "").startsWith(date)) return false;
    if (customer && !j.customer_name.toLowerCase().includes(customer)) return false;
    if (el.todayOnlyFilter.checked && !(j.scheduled_start || "").startsWith(today)) return false;
    return true;
  });
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderMap() {
  const jobs  = getFiltered();
  const today = todayStr();
  markerLayer.clearLayers();

  jobs.forEach(job => {
    const marker = L.marker([job.latitude, job.longitude], {
      icon:  markerIcon(job.appointment_status),
      title: job.customer_name,
    }).bindPopup(buildPopup(job), { maxWidth: 340, minWidth: 280 });

    // Wire popup action buttons
    marker.on("popupopen", () => {
      // Claim button — for Requested/unassigned jobs
      document.querySelectorAll(".btn-action.claim").forEach(btn => {
        btn.addEventListener("click", async () => {
          const srId = btn.dataset.sr;
          if (!srId) { alert("Missing service request ID — cannot claim."); return; }
          btn.disabled    = true;
          btn.textContent = "Claiming…";
          try {
            await sbRpc("claim_service_request", { p_request_id: srId });
            map.closePopup();
            // Reload so the job moves from claimable → my jobs
            const [fresh, claimable] = await Promise.all([loadJobs(), loadClaimableJobs()]);
            allJobs = mergeJobs(fresh, claimable);
            renderMap();
          } catch (e) {
            btn.textContent = "Error — retry";
            btn.disabled    = false;
            console.error("[JECS] Claim failed:", e.message);
            alert("Could not claim job: " + e.message);
          }
        });
      });

      // Advance-status button — for assigned jobs
      document.querySelectorAll(".btn-action.advance").forEach(btn => {
        btn.addEventListener("click", async () => {
          const apptId = btn.dataset.appt;
          const srId   = btn.dataset.sr;
          const next   = btn.dataset.next;
          btn.disabled    = true;
          btn.textContent = "Saving…";
          try {
            await sbPatch(`appointments?appointment_id=eq.${apptId}`, { appointment_status: next });
            if (srId) await sbPatch(`service_requests?request_id=eq.${srId}`, { status: next });
            const j = allJobs.find(x => x.appointment_id === apptId);
            if (j) j.appointment_status = next;
            map.closePopup();
            renderMap();
          } catch (e) {
            btn.textContent = "Error — retry";
            btn.disabled    = false;
            console.error("[JECS] Status update failed:", e.message);
          }
        });
      });
    });

    marker.addTo(markerLayer);
  });

  // Route line — scheduled/confirmed/en route/in progress jobs in time order
  const routeJobs = jobs
    .filter(j => !["Completed","Cancelled","Rescheduled"].includes(j.appointment_status))
    .sort((a, b) => (a.scheduled_start || "").localeCompare(b.scheduled_start || ""));
  routeLine.setLatLngs(routeJobs.map(j => [j.latitude, j.longitude]));

  // Fit bounds
  if (jobs.length) {
    map.fitBounds(L.latLngBounds(jobs.map(j => [j.latitude, j.longitude])).pad(0.15));
  }

  // Metrics
  const todayJobs  = allJobs.filter(j => (j.scheduled_start || "").startsWith(today));
  const remaining  = todayJobs.filter(j => !["Completed","Cancelled","Rescheduled"].includes(j.appointment_status));
  const completed  = todayJobs.filter(j => j.appointment_status === "Completed");
  const driveStops = remaining.length;

  el.todayJobsCount.textContent    = String(todayJobs.length);
  el.remainingJobsCount.textContent = String(remaining.length);
  el.completedJobsCount.textContent = String(completed.length);
  el.driveTime.textContent          = driveStops ? `~${driveStops * 8 + 5} min` : "0 min";
  el.lastUpdated.textContent        = `Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

// ── Sync compact status filter ────────────────────────────────────────────────
function syncFilters(src, tgt) {
  tgt.value = src.value;
  renderMap();
}

// ── Merge assigned + claimable jobs, deduplicated by appointment_id ───────────
function mergeJobs(assigned, claimable) {
  const seen = new Set();
  return [...claimable, ...assigned].filter(j => {
    if (seen.has(j.appointment_id)) return false;
    seen.add(j.appointment_id);
    return true;
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  el.dateFilter.value = todayStr();
  el.lastUpdated.textContent = "Loading from Supabase…";

  const token = getAuthToken();
  if (!token) {
    console.warn("[JECS] No auth token found — claimable jobs require login.");
  }

  try {
    const [assigned, claimable] = await Promise.all([
      loadJobs(),
      loadClaimableJobs(),
    ]);
    allJobs      = mergeJobs(assigned, claimable);
    isSampleData = false;

    if (allJobs.length === 0) {
      console.info("[JECS] No geocoded appointments found — showing sample data.");
      allJobs      = SAMPLE_JOBS;
      isSampleData = true;
    } else {
      console.info(`[JECS] Loaded ${assigned.length} assigned + ${claimable.length} claimable jobs.`);
    }
  } catch (err) {
    console.warn("[JECS] Supabase unreachable, using sample data:", err.message);
    allJobs      = SAMPLE_JOBS;
    isSampleData = true;
  }

  renderMap();
  setTimeout(() => map.invalidateSize(), 150);
}

// ── Event listeners ───────────────────────────────────────────────────────────
el.statusFilter.addEventListener("change",        () => syncFilters(el.statusFilter, el.compactStatusFilter));
el.compactStatusFilter.addEventListener("change", () => syncFilters(el.compactStatusFilter, el.statusFilter));

[el.zipFilter, el.dateFilter, el.customerFilter, el.todayOnlyFilter, el.myJobsFilter]
  .forEach(e => e.addEventListener("input", renderMap));

el.refreshButton.addEventListener("click", async () => {
  el.lastUpdated.textContent = "Refreshing…";
  try {
    const [assigned, claimable] = await Promise.all([loadJobs(), loadClaimableJobs()]);
    const merged = mergeJobs(assigned, claimable);
    if (merged.length > 0) { allJobs = merged; isSampleData = false; }
  } catch (_) {}
  renderMap();
});

init();
