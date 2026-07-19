
import { useState, useEffect, useCallback } from "react";
import { fetchJobs, advanceJobStatus, SAMPLE_JOBS } from "../lib/supabase";

export function useJobs() {
  const [jobs, setJobs]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [isSample, setIsSample] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError]       = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJobs();
      if (data.length > 0) {
        setJobs(data);
        setIsSample(false);
      } else {
        // No geocoded appointments — use sample data
        setJobs(SAMPLE_JOBS);
        setIsSample(true);
      }
    } catch (err) {
      console.warn("[JECS] Supabase unavailable, using sample data:", err.message);
      setJobs(SAMPLE_JOBS);
      setIsSample(true);
      setError(err.message);
    } finally {
      setLoading(false);
      setLastUpdated(new Date());
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Optimistically update a job's status in local state, then persist
  const advanceStatus = useCallback(async (job, newStatus) => {
    // Optimistic update
    setJobs(prev =>
      prev.map(j => j.appointment_id === job.appointment_id
        ? { ...j, appointment_status: newStatus }
        : j
      )
    );
    if (!isSample) {
      try {
        await advanceJobStatus(job, newStatus);
        setLastUpdated(new Date());
      } catch (err) {
        // Revert on failure
        setJobs(prev =>
          prev.map(j => j.appointment_id === job.appointment_id
            ? { ...j, appointment_status: job.appointment_status }
            : j
          )
        );
        throw err;
      }
    }
  }, [isSample]);

  return { jobs, loading, isSample, lastUpdated, error, reload: load, advanceStatus };
}
