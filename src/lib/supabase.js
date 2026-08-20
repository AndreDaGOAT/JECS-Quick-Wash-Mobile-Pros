// ── Supabase config ───────────────────────────────────────────────────────────
const SB_URL = "https://mylqkbpclcrqorjctjxn.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bHFrYnBjbGNycW9yamN0anhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjcxNzgsImV4cCI6MjA5NTMwMzE3OH0.yeZZHm0BEvrJShe8Wek5rfKAwunJQ8byKF1THbtwYYg";

function headers(accessToken) {
  return {
    apikey:         SB_KEY,
    Authorization:  `Bearer ${accessToken || SB_KEY}`,
    "Content-Type": "application/json",
    Prefer:         "return=representation",
  };
}

export async function sbGet(path, accessToken) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: headers(accessToken),
  });
  if (!res.ok) throw new Error(`GET ${res.status}: ${await res.text()}`);
  const txt = await res.text();
  return txt ? JSON.parse(txt) : [];
}

export async function sbPatch(path, body, accessToken) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method:  "PATCH",
    headers: headers(accessToken),
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${res.status}: ${await res.text()}`);
}

// ── Call a Supabase RPC function ──────────────────────────────────────────────
export async function sbRpc(fn, params, accessToken) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method:  "POST",
    headers: headers(accessToken),
    body:    JSON.stringify(params),
  });
  const txt = await res.text();
  const data = txt ? JSON.parse(txt) : null;
  if (!res.ok) {
    const msg = data?.message || data?.error || `RPC error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// ── Status pipeline ───────────────────────────────────────────────────────────
export const STATUS_PIPELINE = [
  "Requested", "Confirmed", "En Route",
  "In Progress", "Quality Check", "Completed",
];

export const STATUS_COLORS = {
  "Requested":     "#7A90B0",
  "Confirmed":     "#0284C7",
  "En Route":      "#8B5CF6",
  "In Progress":   "#F59E0B",
  "Quality Check": "#D4A843",
  "Completed":     "#10B981",
  "Cancelled":     "#EF4444",
  "Rescheduled":   "#6B7280",
  // Service request statuses
  "Pending":       "#F59E0B",
  "Assigned":      "#0284C7",
};

export function nextStatus(current) {
  const idx = STATUS_PIPELINE.indexOf(current);
  return idx >= 0 && idx < STATUS_PIPELINE.length - 1
    ? STATUS_PIPELINE[idx + 1]
    : null;
}

// ── Claim a service request via RPC ──────────────────────────────────────────
// Calls claim_service_request(p_request_id) which:
//   - Verifies the tech is approved + active
//   - Checks territory match
//   - Atomically assigns the request (FOR UPDATE concurrency lock)
//   - Returns the full enriched request row
export async function claimServiceRequest(requestId, accessToken) {
  const result = await sbRpc(
    "claim_service_request",
    { p_request_id: requestId },
    accessToken
  );
  // RPC returns an array of rows (RETURNS TABLE)
  return Array.isArray(result) ? result[0] : result;
}

// ── Advance appointment status + sync service_request ────────────────────────
export async function advanceJobStatus(job, newStatus, accessToken) {
  await sbPatch(
    `appointments?appointment_id=eq.${job.appointment_id}`,
    { appointment_status: newStatus },
    accessToken
  );
  if (job.service_request_id) {
    await sbPatch(
      `service_requests?request_id=eq.${job.service_request_id}`,
      { status: newStatus },
      accessToken
    );
  }
}

// ── Fetch claimable service requests (Pending, in tech's territory) ───────────
// The territory check is enforced server-side by claim_service_request.
// Here we just fetch all Pending requests with customer location data
// so the tech can see what's available on the map before claiming.
export async function fetchPendingRequests(accessToken) {
  const rows = await sbGet(
    "service_requests?select=request_id,service_request_number,customer_id,requested_date,special_notes,status,cluster_key,customers(full_name,formatted_address,latitude,longitude,zip_code,phone_number,email)&status=eq.Pending&order=created_at.asc&limit=100",
    accessToken
  );

  return (rows || [])
    .map(r => {
      const c = r.customers || {};
      return {
        // Map Pending service requests to the same shape as appointments
        // so JobMarker can render them uniformly
        appointment_id:       r.request_id,     // reuse field for map key
        request_id:           r.request_id,
        service_request_number: r.service_request_number,
        appointment_status:   "Pending",         // display status
        is_claimable:         true,              // flag for popup CTA
        scheduled_start:      r.requested_date ? `${r.requested_date}T08:00:00` : null,
        preferred_time_window: null,
        customer_notes:       r.special_notes,
        cluster_key:          r.cluster_key,
        customer_name:        c.full_name         || "New Request",
        formatted_address:    c.formatted_address || "",
        phone_number:         "",                // hidden until claimed
        latitude:             parseFloat(c.latitude)  || null,
        longitude:            parseFloat(c.longitude) || null,
        zip_code:             c.zip_code         || "",
        vehicle_type:         "—",
        license_plate:        "—",
        weather_score:        null,
      };
    })
    .filter(r => r.latitude && r.longitude);
}

// ── Fetch the tech's own assigned/active appointments ─────────────────────────
export async function fetchMyJobs(washProId, accessToken) {
  // Fetch appointments assigned to this wash pro
  const appts = await sbGet(
    `appointments?select=*,customers(full_name,formatted_address,latitude,longitude,zip_code,phone_number,email)&order=scheduled_start.asc&limit=200`,
    accessToken
  );

  const mine = appts.filter(a =>
    a.assigned_employee_id === washProId ||
    !["Completed","Cancelled","Rescheduled"].includes(a.appointment_status)
  );

  // Enrich with vehicle data
  const enriched = await Promise.all(mine.map(async a => {
    let vehicleType = null, licensePlate = null;

    if (a.service_request_id) {
      try {
        const srs = await sbGet(
          `service_requests?request_id=eq.${a.service_request_id}&select=vehicle_id&limit=1`,
          accessToken
        );
        const vid = srs?.[0]?.vehicle_id;
        if (vid) {
          const vehs = await sbGet(
            `vehicles?vehicle_id=eq.${vid}&select=vehicle_type,license_plate&limit=1`,
            accessToken
          );
          vehicleType  = vehs?.[0]?.vehicle_type  || null;
          licensePlate = vehs?.[0]?.license_plate || null;
        }
      } catch (_) {}
    }

    const c = a.customers || {};
    return {
      appointment_id:        a.appointment_id,
      service_request_id:    a.service_request_id,
      assigned_employee_id:  a.assigned_employee_id,
      appointment_status:    a.appointment_status || "Requested",
      scheduled_start:       a.scheduled_start,
      preferred_time_window: a.preferred_time_window,
      customer_notes:        a.customer_notes,
      weather_score:         a.weather_score,
      is_claimable:          false,
      customer_name:         c.full_name         || "Unknown",
      formatted_address:     c.formatted_address || "",
      phone_number:          c.phone_number       || "",
      email:                 c.email              || "",
      latitude:              parseFloat(c.latitude)  || null,
      longitude:             parseFloat(c.longitude) || null,
      zip_code:              c.zip_code           || "",
      vehicle_type:          vehicleType          || "—",
      license_plate:         licensePlate         || "—",
    };
  }));

  return enriched.filter(j => j.latitude && j.longitude);
}

// ── Fetch wash pro profile for the logged-in tech ─────────────────────────────
export async function fetchWashProProfile(profileId, accessToken) {
  const rows = await sbGet(
    `wash_pro_profiles?profile_id=eq.${profileId}&select=wash_pro_id,worker_type,onboarding_status,active,w9_status&limit=1`,
    accessToken
  );
  return rows?.[0] || null;
}

// ── Sample fallback data (Memphis) ────────────────────────────────────────────
export const SAMPLE_JOBS = [
  {
    appointment_id: "s-pending-1", request_id: "s-pending-1",
    service_request_number: "JECS-SAMPLE-001",
    appointment_status: "Pending", is_claimable: true,
    customer_name: "New Request — East Memphis",
    formatted_address: "1234 Poplar Ave, Memphis, TN 38104",
    phone_number: "", latitude: 35.1494, longitude: -90.0490,
    zip_code: "38104",
    scheduled_start: `${new Date().toISOString().slice(0,10)}T10:00:00`,
    customer_notes: "Silver sedan in lot B", vehicle_type: "—", license_plate: "—",
  },
  {
    appointment_id: "s-pending-2", request_id: "s-pending-2",
    service_request_number: "JECS-SAMPLE-002",
    appointment_status: "Pending", is_claimable: true,
    customer_name: "New Request — Midtown",
    formatted_address: "789 Union Ave, Memphis, TN 38103",
    phone_number: "", latitude: 35.1456, longitude: -90.0520,
    zip_code: "38103",
    scheduled_start: `${new Date().toISOString().slice(0,10)}T14:00:00`,
    customer_notes: null, vehicle_type: "—", license_plate: "—",
  },
  {
    appointment_id: "s-assigned-1",
    appointment_status: "Confirmed", is_claimable: false,
    customer_name: "DeShawn Brown",
    formatted_address: "456 Madison Ave, Memphis, TN 38103",
    phone_number: "(901) 555-0303",
    latitude: 35.1470, longitude: -90.0480, zip_code: "38103",
    scheduled_start: `${new Date().toISOString().slice(0,10)}T12:00:00`,
    preferred_time_window: "11AM-2PM",
    vehicle_type: "2019 Silver Ford F-150", license_plate: "TN-DEF789",
    customer_notes: null, weather_score: 88,
  },
];
