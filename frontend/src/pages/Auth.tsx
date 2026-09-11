import { useState } from "react";
import { Link } from "react-router-dom";
import { client, type User } from "../api";
import { APP_NAME, BrandMark } from "../lib/brand";

export function AuthForm({
  mode,
  onDone,
}: {
  mode: "login" | "register";
  onDone: (u: User) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res =
        mode === "login"
          ? await client.login({ email, password })
          : await client.register({ email, password, name });
      onDone(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo">
          <BrandMark size={40} />
        </div>
        <h1>{mode === "login" ? `Log in to ${APP_NAME}` : `Sign up for ${APP_NAME}`}</h1>
        {mode === "register" && (
          <label>
            Full name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn-primary wide" disabled={busy}>
          {mode === "login" ? "Continue" : "Sign up"}
        </button>
        <p className="auth-footer">
          {mode === "login" ? (
            <>
              New? <Link to="/register">Create an account</Link>
            </>
          ) : (
            <>
              Already have an account? <Link to="/login">Log in</Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
