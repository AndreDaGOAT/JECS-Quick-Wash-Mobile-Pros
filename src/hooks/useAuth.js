import { useState, useEffect, useCallback } from "react";
import {
  signIn, signOut, fetchProfile, refreshSession,
  getSavedSession, saveSession, clearSession,
} from "../lib/auth";

export function useAuth() {
  const [session,  setSession]  = useState(null);   // Supabase auth session
  const [profile,  setProfile]  = useState(null);   // profiles table row
  const [loading,  setLoading]  = useState(true);   // initial session restore
  const [error,    setError]    = useState("");

  // ── Restore session on mount ──────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const saved = getSavedSession();
      if (saved?.access_token && saved?.user?.id) {
        try {
          // Check if token is expired (Supabase JWT has exp claim in seconds)
          const payload = JSON.parse(atob(saved.access_token.split(".")[1]));
          const isExpired = payload.exp && payload.exp * 1000 < Date.now();

          let activeSession = saved;

          if (isExpired && saved.refresh_token) {
            // Attempt silent refresh using the refresh token
            const refreshed = await refreshSession(saved.refresh_token);
            if (refreshed?.access_token) {
              saveSession(refreshed);
              activeSession = refreshed;
            } else {
              // Refresh failed — force re-login
              clearSession();
              setLoading(false);
              return;
            }
          } else if (isExpired) {
            // No refresh token — force re-login
            clearSession();
            setLoading(false);
            return;
          }

          const prof = await fetchProfile(activeSession.user.id, activeSession.access_token);
          setSession(activeSession);
          setProfile(prof);
        } catch (err) {
          // Session expired or role changed — clear it
          clearSession();
        }
      }
      setLoading(false);
    })();
  }, []);

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    setError("");
    setLoading(true);
    try {
      const sess = await signIn(email, password);
      const prof = await fetchProfile(sess.user.id, sess.access_token);
      saveSession(sess);
      setSession(sess);
      setProfile(prof);
    } catch (err) {
      setError(err.message || "Login failed.");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    if (session?.access_token) {
      try { await signOut(session.access_token); } catch (_) {}
    }
    clearSession();
    setSession(null);
    setProfile(null);
    setError("");
  }, [session]);

  return {
    session,
    profile,
    loading,
    error,
    isAuthenticated: !!session && !!profile,
    login,
    logout,
  };
}
