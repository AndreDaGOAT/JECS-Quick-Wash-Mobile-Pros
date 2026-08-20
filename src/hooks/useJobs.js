import { useState, useEffect, useCallback } from "react";
import {
  fetchPendingRequests,
  fetchMyJobs,
  fetchWashProProfile,
  advanceJobStatus,
  claimServiceRequest,
  SAMPLE_JOBS,
} from "../lib/supabase";

export function useJobs(session, profile) {
  const [jobs, setJobs]           = useState([]);
  const [washPro, setWashPro]     = useState(null);  // wash_pro_profiles row
  const [loading, setLoading]     = useState(true);
  const [isSample, setIsSample]   = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError]         = useState(null);

  const accessToken = session?.access_token;
  const profileId   = profile?.id || session?.user?.id;

  // ── Load wash pro profile + all jobs ─────────────────────────────────────
  const load = useCallback(async () => {
    if (!accessToken || !profileId) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch the tech's wash_pro_profiles row
      const wp = await fetchWashProProfile(profileId, accessToken);
      setWashPro(wp);

      // 2. Fetch claimable pending requests + tech's own jobs in parallel
      const [pending, myJobs] = await Promise.all([
        fetchPendingRequests(accessToken).catch(() => []),
        wp?.wash_pro_id
          ? fetchMyJobs(wp.wash_pro_id, accessToken).catch(() => [])
          : Promise.resolve([]),
      ]);

      // Merge — pending requests shown on map with "Claim" CTA
      // Tech's jobs shown with status advancement buttons
      // Deduplicate by appointment_id in case a job appears in both
      const seen = new Set();
      const merged = [...pending, ...myJobs].filter(j => {
        if (seen.has(j.appointment_id)) return false;
        seen.add(j.appointment_id);
        return true;
      });

      if (merged.length > 0) {
        setJobs(merged);
        setIsSample(false);
      } else {
        setJobs(SAMPLE_JOBS);
        setIsSample(true);
      }
    } catch (err) {
      console.warn("[JECS] Job load failed, using sample data:", err.message);
      setJobs(SAMPLE_JOBS);
      setIsSample(true);
      setError(err.message);
    } finally {
      setLoading(false);
      setLastUpdated(new Date());
    }
  }, [accessToken, profileId]);

  useEffect(() => { load(); }, [load]);

  // ── Claim a pending service request ──────────────────────────────────────
  const claimJob = useCallback(async (job) => {
    if (isSample) {
      // Simulate claim in sample mode
      setJobs(prev => prev.map(j =>
        j.appointment_id === job.appointment_id
          ? { ...j, appointment_status: "Assigned", is_claimable: false,
              customer_name: "Claimed — " + j.customer_name }
          : j
      ));
      return { claimed: true };
    }

    const result = await claimServiceRequest(job.request_id, accessToken);
    // Reload to get fresh state — removes request from pending, adds to my jobs
    await load();
    return result;
  }, [isSample, accessToken, load]);

  // ── Advance appointment status ────────────────────────────────────────────
  const advanceStatus = useCallback(async (job, newStatus) => {
    // Optimistic update
    setJobs(prev => prev.map(j =>
      j.appointment_id === job.appointment_id
        ? { ...j, appointment_status: newStatus }
        : j
    ));

    if (!isSample) {
      try {
        await advanceJobStatus(job, newStatus, accessToken);
        setLastUpdated(new Date());
      } catch (err) {
        // Revert on failure
        setJobs(prev => prev.map(j =>
          j.appointment_id === job.appointment_id
            ? { ...j, appointment_status: job.appointment_status }
            : j
        ));
        throw err;
      }
    }
  }, [isSample, accessToken]);

  return {
    jobs, washPro, loading, isSample,
    lastUpdated, error,
    reload: load,
    claimJob,
    advanceStatus,
  };
}
