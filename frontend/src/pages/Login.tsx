import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const { user, login } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f3f4f6", fontFamily: "system-ui, sans-serif" }}>
      <form onSubmit={submit} style={{ background: "#fff", padding: 32, borderRadius: 12, boxShadow: "0 1px 3px #0002", width: 320, display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Sign in to ERP</h2>
        <input type="email" placeholder="Email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="Password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div style={{ color: "#dc2626", fontSize: 14 }}>{error}</div>}
        <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
