
// ── Supabase config ───────────────────────────────────────────────────────────
const SB_URL = "https://mylqkbpclcrqorjctjxn.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bHFrYnBjbGNycW9yamN0anhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjcxNzgsImV4cCI6MjA5NTMwMzE3OH0.yeZZHm0BEvrJShe8Wek5rfKAwunJQ8byKF1THbtwYYg";

const HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

export async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase GET ${res.status}: ${await res.text()}`);
  const txt = await res.text();
  return txt ? JSON.parse(txt) : [];
}

export async function sbPatch(path, body) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${res.status}: ${await res.text()}`);
}

// ── Status pipeline (mirrors admin dashboard) ─────────────────────────────────
export const STATUS_PIPELINE = [
  "Requested",
  "Confirmed",
  "En Route",
  "In Progress",
  "Quality Check",
  "Completed",
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
};

export function nextStatus(current) {
  const idx = STATUS_PIPELINE.indexOf(current);
  return idx >= 0 && idx < STATUS_PIPELINE.length - 1 ? STATUS_PIPELINE[idx + 1] : null;
}

// ── Fetch all appointments enriched with customer + vehicle data ──────────────
export async function fetchJobs() {
  // Fetch appointments + customer location
  const appts = await sbGet(
    "appointments?select=*,customers(full_name,formatted_address,latitude,longitude,zip_code,phone_number)&order=scheduled_start.asc&limit=300"
  );

  // Enrich each with vehicle data via service_requests → vehicles
  const jobs = await Promise.all(appts.map(async (a) => {
    let vehicleType  = null;
    let licensePlate = null;

    if (a.service_request_id) {
      try {
        const srs = await sbGet(
          `service_requests?request_id=eq.${a.service_request_id}&select=vehicle_id&limit=1`
        );
        const vid = srs?.[0]?.vehicle_id;
        if (vid) {
          const vehs = await sbGet(
            `vehicles?vehicle_id=eq.${vid}&select=vehicle_type,license_plate&limit=1`
          );
          vehicleType  = vehs?.[0]?.vehicle_type  || null;
          licensePlate = vehs?.[0]?.license_plate || null;
        }
      } catch (_) {}
    }

    // Fallback: most recent vehicle by customer_id
    if (!vehicleType && a.customer_id) {
      try {
        const vehs = await sbGet(
          `vehicles?customer_id=eq.${a.customer_id}&select=vehicle_type,license_plate&order=created_at.desc&limit=1`
        );
        vehicleType  = vehs?.[0]?.vehicle_type  || null;
        licensePlate = vehs?.[0]?.license_plate || null;
      } catch (_) {}
    }

    const c = a.customers || {};
    return {
      appointment_id:        a.appointment_id,
      service_request_id:    a.service_request_id,
      assigned_employee_id:  a.assigned_employee_id,
      appointment_status:    a.appointment_status || "Requested",
      scheduled_start:       a.scheduled_start,
      scheduled_end:         a.scheduled_end,
      preferred_time_window: a.preferred_time_window,
      customer_notes:        a.customer_notes,
      weather_score:         a.weather_score,
      customer_name:         c.full_name         || "Unknown",
      formatted_address:     c.formatted_address || "",
      phone_number:          c.phone_number       || "",
      latitude:              parseFloat(c.latitude)  || null,
      longitude:             parseFloat(c.longitude) || null,
      zip_code:              c.zip_code           || "",
      vehicle_type:          vehicleType          || "—",
      license_plate:         licensePlate         || "—",
    };
  }));

  // Only return jobs with valid coordinates (needed for map)
  return jobs.filter(j => j.latitude && j.longitude);
}

// ── Patch appointment status + sync service_request ───────────────────────────
export async function advanceJobStatus(job, newStatus) {
  await sbPatch(
    `appointments?appointment_id=eq.${job.appointment_id}`,
    { appointment_status: newStatus }
  );
  if (job.service_request_id) {
    await sbPatch(
      `service_requests?request_id=eq.${job.service_request_id}`,
      { status: newStatus }
    );
  }
}

// ── Sample fallback data (Memphis) ────────────────────────────────────────────
export const SAMPLE_JOBS = [
  { appointment_id:"s1", appointment_status:"Confirmed",    customer_name:"James Carter",   formatted_address:"1234 Poplar Ave, Memphis, TN 38104", phone_number:"(901) 555-0101", latitude:35.1494, longitude:-90.0490, zip_code:"38104", scheduled_start:"__TODAY__T08:00:00", preferred_time_window:"8AM-11AM",  vehicle_type:"2022 Black Toyota Camry",   license_plate:"TN-ABC123", weather_score:92 },
  { appointment_id:"s2", appointment_status:"En Route",     customer_name:"Maria Gonzalez", formatted_address:"789 Union Ave, Memphis, TN 38103",   phone_number:"(901) 555-0202", latitude:35.1456, longitude:-90.0520, zip_code:"38103", scheduled_start:"__TODAY__T10:00:00", preferred_time_window:"8AM-11AM",  vehicle_type:"2020 White Honda CR-V",    license_plate:"TN-XYZ456", weather_score:88 },
  { appointment_id:"s3", appointment_status:"In Progress",  customer_name:"DeShawn Brown",  formatted_address:"456 Madison Ave, Memphis, TN 38103", phone_number:"(901) 555-0303", latitude:35.1470, longitude:-90.0480, zip_code:"38103", scheduled_start:"__TODAY__T12:00:00", preferred_time_window:"11AM-2PM",  vehicle_type:"2019 Silver Ford F-150",  license_plate:"TN-DEF789", weather_score:85 },
  { appointment_id:"s4", appointment_status:"Requested",    customer_name:"Angela White",   formatted_address:"321 Beale St, Memphis, TN 38103",    phone_number:"(901) 555-0404", latitude:35.1398, longitude:-90.0503, zip_code:"38103", scheduled_start:"__TODAY__T14:00:00", preferred_time_window:"2PM-5PM",   vehicle_type:"2023 Blue Kia Soul",      license_plate:"TN-GHI012", weather_score:90 },
  { appointment_id:"s5", appointment_status:"Completed",    customer_name:"Robert Kim",     formatted_address:"555 Peabody Pl, Memphis, TN 38103",  phone_number:"(901) 555-0505", latitude:35.1420, longitude:-90.0540, zip_code:"38103", scheduled_start:"__TODAY__T06:30:00", preferred_time_window:"8AM-11AM",  vehicle_type:"2021 Red Jeep Wrangler",  license_plate:"TN-JKL345", weather_score:95 },
].map(j => ({
  ...j,
  scheduled_start: j.scheduled_start.replace("__TODAY__", new Date().toISOString().slice(0, 10)),
}));
