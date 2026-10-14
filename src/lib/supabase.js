export async function fetchPendingRequests(accessToken) {
  const rows = await sbRpc("fetch_claimable_appointments", {}, accessToken);
  return (rows || [])
    .map(a => ({
      appointment_id:         a.out_appointment_id,
      request_id:             a.out_service_request_id,
      service_request_number: a.out_service_request_number || "—",
      appointment_status:     "Requested",
      is_claimable:           true,
      scheduled_start:        a.out_scheduled_start         || null,
      preferred_time_window:  a.out_preferred_time_window   || null,
      customer_notes:         a.out_customer_notes          || null,
      cluster_key:            a.out_cluster_key             || null,
      customer_name:          a.out_customer_name           || "New Request",
      formatted_address:      a.out_formatted_address       || "",
      phone_number:           "",
      latitude:               parseFloat(a.out_latitude)    || null,
      longitude:              parseFloat(a.out_longitude)   || null,
      zip_code:               a.out_zip_code                || "",
      vehicle_type:           a.out_vehicle_type            || "—",
      license_plate:          a.out_license_plate           || "—",
      weather_score:          null,
    }))
    .filter(r => r.latitude && r.longitude);
}
