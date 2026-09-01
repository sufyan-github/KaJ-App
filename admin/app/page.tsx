"use client";

import { FormEvent, useEffect, useState } from "react";

import { OperationsConsole } from "./components/operations-console";

type Admin = { email: string; role: string; userId: string };
type Stage = "checking" | "login" | "totp" | "dashboard";

function readError(body: unknown): string {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: { message?: unknown } }).error;
    if (typeof error?.message === "string") return error.message;
  }
  return "Something went wrong. Try again.";
}

export default function AdminPage() {
  const [stage, setStage] = useState<Stage>("checking");
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [challengeToken, setChallengeToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const body = await response.json();
        setAdmin(body.data);
        setStage("dashboard");
      })
      .catch(() => setStage("login"));
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) return setError(readError(body));
    setChallengeToken(body.data.challengeToken);
    setStage("totp");
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/totp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeToken, code: form.get("code") }),
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) return setError(readError(body));
    setAdmin(body.data);
    setStage("dashboard");
  }

  async function logout() {
    setBusy(true);
    await fetch("/api/admin/logout", { method: "POST" });
    setAdmin(null);
    setChallengeToken("");
    setBusy(false);
    setStage("login");
  }

  if (stage === "checking") {
    return (
      <main className="center">
        <div className="loader" aria-label="Checking secure session" />
      </main>
    );
  }

  if (stage === "login" || stage === "totp") {
    return (
      <main className="auth-shell">
        <section className="auth-story">
          <div className="brand-mark">ক</div>
          <p className="eyebrow">KAAJ · OPERATIONS</p>
          <h1>Keep local work moving.</h1>
          <p>
            Secure tools for the people supporting Rajshahi&apos;s workers and
            customers.
          </p>
          <div className="security-note">
            <span>✓</span> Every operational action is recorded in the audit
            trail.
          </div>
        </section>
        <section className="auth-panel">
          <div className="auth-card">
            <p className="step">
              SECURE SIGN-IN · {stage === "login" ? "1 OF 2" : "2 OF 2"}
            </p>
            <h2>{stage === "login" ? "Welcome back" : "Verify it’s you"}</h2>
            <p className="muted">
              {stage === "login"
                ? "Use your assigned operations account."
                : "Enter the six-digit code from your authenticator app."}
            </p>
            <form onSubmit={stage === "login" ? login : verify}>
              {stage === "login" ? (
                <>
                  <label>
                    Email address
                    <input
                      name="email"
                      type="email"
                      autoComplete="username"
                      required
                    />
                  </label>
                  <label>
                    Password
                    <input
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      minLength={12}
                      required
                    />
                  </label>
                </>
              ) : (
                <label>
                  Authenticator code
                  <input
                    className="code-input"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoFocus
                    required
                  />
                </label>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary" disabled={busy}>
                {busy
                  ? "Please wait…"
                  : stage === "login"
                    ? "Continue securely"
                    : "Open operations"}
              </button>
              {stage === "totp" && (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setError("");
                    setStage("login");
                  }}
                >
                  Use another account
                </button>
              )}
            </form>
          </div>
        </section>
      </main>
    );
  }

  return admin ? (
    <OperationsConsole admin={admin} busy={busy} logout={logout} />
  ) : null;
}
