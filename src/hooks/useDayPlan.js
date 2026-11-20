import { useState, useEffect, useCallback } from "react";
import { fetchDayPlan, fetchGapFillers, todayStr } from "../lib/dayPlan";

export function useDayPlan(session) {
  const [date,    setDate]    = useState(todayStr());
  const [plan,    setPlan]    = useState([]);
  const [fillers, setFillers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const accessToken = session?.access_token;

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      // The plan is what matters. Suggestions are a bonus — if that call
      // fails, still show the day rather than an error screen.
      const planRows = await fetchDayPlan(date, accessToken);
      setPlan(planRows);
      try {
        setFillers(await fetchGapFillers(date, accessToken));
      } catch (err) {
        console.warn("[JECS] Gap suggestions unavailable:", err.message);
        setFillers([]);
      }
    } catch (err) {
      console.error("[JECS] Day plan failed:", err.message);
      setError(err.message);
      setPlan([]);
      setFillers([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, date]);

  useEffect(() => { load(); }, [load]);

  return { date, setDate, plan, fillers, loading, error, reload: load };
}
