"use client";

import { FormEvent, useEffect, useState } from "react";

type Admin = { email: string; role: string; userId: string };
type Stage = "checking" | "login" | "totp" | "dashboard";

const modules = [
  ["Dashboard", "Live marketplace health", "ready"],
  ["Users", "Search, support and moderation", "next"],
  ["Jobs", "Inspect lifecycle and rescue stuck work", "next"],
  ["Applications", "Review and unstick applications", "next"],
  ["Verification", "Document review queue", "next"],
  ["Categories", "Skills and safety policies", "next"],
  ["Locations", "Launch areas without deployment", "next"],
  ["Configuration", "Versioned operational settings", "next"],
  ["Feature flags", "Controlled percentage rollouts", "next"],
  ["Disputes", "Evidence and resolution", "next"],
  ["Notifications", "Targeted, throttled campaigns", "next"],
  ["Analytics", "Marketplace health metrics", "planned"],
] as const;

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

  return (
    <main className="ops-shell">
      <aside>
        <div className="brand-row">
          <div className="brand-mark small">ক</div>
          <div>
            <strong>KAAJ</strong>
            <span>OPERATIONS</span>
          </div>
        </div>
        <nav>
          {modules.map(([name], index) => (
            <button
              className={index === 0 ? "active" : ""}
              key={name}
              disabled={index !== 0}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {name}
            </button>
          ))}
        </nav>
        <div className="account">
          <div className="avatar">{admin?.email[0]?.toUpperCase()}</div>
          <div>
            <strong>{admin?.email}</strong>
            <span>{admin?.role}</span>
          </div>
          <button onClick={logout} disabled={busy} aria-label="Sign out">
            ↗
          </button>
        </div>
      </aside>
      <section className="workspace">
        <header>
          <div>
            <p className="eyebrow">MVP OPERATIONS</p>
            <h1>Good evening.</h1>
            <p>Here’s the operational surface for KAAJ.</p>
          </div>
          <div className="session-pill">
            <span /> Secure session · 30 min
          </div>
        </header>
        <div className="notice">
          <strong>Admin foundation is live.</strong>
          <span>
            Email/password, TOTP, role control and immutable audit events are
            active.
          </span>
        </div>
        <div className="section-title">
          <div>
            <h2>Operations modules</h2>
            <p>Risk-first tools for support and marketplace safety.</p>
          </div>
          <span>1 of 12 active</span>
        </div>
        <div className="module-grid">
          {modules.map(([name, description, state], index) => (
            <article className={state === "ready" ? "ready" : ""} key={name}>
              <div className="module-top">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <em>
                  {state === "ready"
                    ? "AVAILABLE"
                    : state === "next"
                      ? "NEXT BUILD"
                      : "PLANNED"}
                </em>
              </div>
              <h3>{name}</h3>
              <p>{description}</p>
              <button disabled={state !== "ready"}>
                {state === "ready" ? "Open module →" : "Coming next"}
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
