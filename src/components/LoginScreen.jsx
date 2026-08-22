
import { useState } from "react";

export default function LoginScreen({ onLogin, loading, error }) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [localErr, setLocalErr] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setLocalErr("");

    if (!email.trim())    { setLocalErr("Email is required."); return; }
    if (!password.trim()) { setLocalErr("Password is required."); return; }

    setSubmitting(true);
    try {
      await onLogin(email.trim().toLowerCase(), password);
    } catch (err) {
      // Error is already set by useAuth, just stop submitting
    } finally {
      setSubmitting(false);
    }
  }

  const displayErr = localErr || error;

  return (
    <div className="login-shell">
      <div className="login-card">

        {/* Logo */}
        <div className="login-logo">
          <span className="logo-jecs">JECS</span>
          <span className="logo-sub">Quick Wash</span>
        </div>

        <div className="login-title">Mobile Wash Pro</div>
        <p className="login-desc">Sign in with your employee account to access today's jobs.</p>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="login-field">
            <label htmlFor="wp-email">Email</label>
            <input
              id="wp-email"
              type="email"
              placeholder="your@email.com"
              value={email}
              autoComplete="email"
              autoCapitalize="none"
              onChange={e => setEmail(e.target.value)}
              disabled={submitting || loading}
            />
          </div>

          <div className="login-field">
            <label htmlFor="wp-password">Password</label>
            <div className="pass-wrap">
              <input
                id="wp-password"
                type={showPass ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                autoComplete="current-password"
                onChange={e => setPassword(e.target.value)}
                disabled={submitting || loading}
              />
              <button
                type="button"
                className="pass-toggle"
                onClick={() => setShowPass(v => !v)}
                tabIndex={-1}
                aria-label={showPass ? "Hide password" : "Show password"}>
                {showPass ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          {displayErr && (
            <div className="login-error" role="alert">
              ⚠ {displayErr}
            </div>
          )}

          <button
            type="submit"
            className="login-btn"
            disabled={submitting || loading}>
            {submitting ? "Signing in…" : loading ? "Restoring session…" : "Sign In"}
          </button>
        </form>

        <p className="login-footer">
          Authorised employees only · Jubilee Executive Car Service
        </p>
      </div>
    </div>
  );
}
