import { useState, useEffect, useCallback } from "react";
import { fetchTotals, fetchPeriods, fetchBalance, GRAINS } from "../lib/earnings";

export function useEarnings(session) {
  const [grain,   setGrain]   = useState("day");
  const [totals,  setTotals]  = useState(null);
  const [periods, setPeriods] = useState([]);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const accessToken = session?.access_token;

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    const limit = (GRAINS.find(g => g.id === grain) || GRAINS[0]).periods;
    try {
      // The totals and the breakdown are the screen. The cash-out balance is
      // extra — if that call fails, still show the earnings rather than an
      // error page over the whole thing.
      const [t, p] = await Promise.all([
        fetchTotals(accessToken),
        fetchPeriods(grain, limit, accessToken),
      ]);
      setTotals(t);
      setPeriods(p);
      try {
        setBalance(await fetchBalance(accessToken));
      } catch (err) {
        console.warn("[JECS] Balance unavailable:", err.message);
        setBalance(null);
      }
    } catch (err) {
      console.error("[JECS] Earnings failed:", err.message);
      setError(err.message);
      setTotals(null);
      setPeriods([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, grain]);

  useEffect(() => { load(); }, [load]);

  return { grain, setGrain, totals, periods, balance, loading, error, reload: load };
}
