// ── Supabase Auth config ──────────────────────────────────────────────────────
const SB_URL = "https://mylqkbpclcrqorjctjxn.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bHFrYnBjbGNycW9yamN0anhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjcxNzgsImV4cCI6MjA5NTMwMzE3OH0.yeZZHm0BEvrJShe8Wek5rfKAwunJQ8byKF1THbtwYYg";

const ALLOWED_ROLES = ["employee", "admin", "wash_pro", "independent_contractor"];

// ── Auth API calls ────────────────────────────────────────────────────────────

// Sign in with email + password via Supabase Auth
export async function signIn(email, password) {
  const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SB_KEY,
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    // Surface friendly error messages
    const msg = data?.error_description || data?.msg || data?.error || "Login failed.";
    throw new Error(msg);
  }

  return data; // { access_token, refresh_token, user, ... }
}

// Sign out — revoke the session token
export async function signOut(accessToken) {
  await fetch(`${SB_URL}/auth/v1/logout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SB_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

// Fetch the profile for the logged-in user and check their role
export async function fetchProfile(userId, accessToken) {
  const res = await fetch(
    `${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=id,full_name,email,role,phone_number&limit=1`,
    {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) throw new Error("Could not load profile.");

  const rows = await res.json();
  if (!rows || rows.length === 0) throw new Error("No profile found for this account.");

  const profile = rows[0];

  if (!ALLOWED_ROLES.includes((profile.role || "").toLowerCase())) {
    throw new Error(
      `Access denied. This app is for JECS Wash Pros only.\nYour role: "${profile.role}"`
    );
  }

  return profile;
}

// Restore session from localStorage on page load
export function getSavedSession() {
  try {
    const raw = localStorage.getItem("jecs_wp_session");
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function saveSession(session) {
  try {
    localStorage.setItem("jecs_wp_session", JSON.stringify(session));
  } catch (_) {}
}

export function clearSession() {
  try {
    localStorage.removeItem("jecs_wp_session");
  } catch (_) {}
}
