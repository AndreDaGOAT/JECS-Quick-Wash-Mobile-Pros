diff --git a/src/lib/supabase.js b/src/lib/supabase.js
index 69926fc..78ee3cf 100644
--- a/src/lib/supabase.js
+++ b/src/lib/supabase.js
@@ -90,18 +90,13 @@ export async function claimServiceRequest(requestId, accessToken) {
 
 // ── Advance appointment status + sync service_request ────────────────────────
 export async function advanceJobStatus(job, newStatus, accessToken) {
-  await sbPatch(
-    `appointments?appointment_id=eq.${job.appointment_id}`,
-    { appointment_status: newStatus },
+  // Server enforces: job must be assigned to this Wash Pro, status can only move
+  // one step forward, and appointment + service request update together.
+  return sbRpc(
+    "advance_job_status",
+    { p_appointment_id: job.appointment_id, p_new_status: newStatus },
     accessToken
   );
-  if (job.service_request_id) {
-    await sbPatch(
-      `service_requests?request_id=eq.${job.service_request_id}`,
-      { status: newStatus },
-      accessToken
-    );
-  }
 }
 
 // ── Fetch claimable service requests (Pending, in tech's territory) ───────────
@@ -147,14 +142,12 @@ export async function fetchPendingRequests(accessToken) {
 export async function fetchMyJobs(washProId, accessToken) {
   // Fetch appointments assigned to this wash pro
   const appts = await sbGet(
-    `appointments?select=*,customers(full_name,formatted_address,latitude,longitude,zip_code,phone_number,email)&order=scheduled_start.asc&limit=200`,
+    `appointments?select=*,customers(full_name,formatted_address,latitude,longitude,zip_code,phone_number,email)&assigned_employee_id=eq.${washProId}&order=scheduled_start.asc&limit=200`,
     accessToken
   );
 
-  const mine = appts.filter(a =>
-    a.assigned_employee_id === washProId ||
-    !["Completed","Cancelled","Rescheduled"].includes(a.appointment_status)
-  );
+  // Only this Wash Pro's jobs. (Previously `||` let every unfinished job through.)
+  const mine = appts.filter(a => a.assigned_employee_id === washProId);
 
   // Enrich with vehicle data
   const enriched = await Promise.all(mine.map(async a => {
