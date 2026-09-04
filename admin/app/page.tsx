"use client";
import { FormEvent, useEffect, useState } from "react";
import {
  AdminLocale,
  friendlyAdminError,
  setActiveAdminLocale,
  tr,
} from "@/lib/admin-i18n";
import { OperationsConsole } from "./components/operations-console";
type Admin = {
  email: string;
  role: string;
  userId: string;
};
type Stage = "checking" | "login" | "totp" | "dashboard";
function readError(body: unknown): string {
  if (body && typeof body === "object" && "error" in body) {
    const error = (
      body as {
        error?: {
          message?: unknown;
        };
      }
    ).error;
    if (typeof error?.message === "string") return error.message;
  }
  return "Something went wrong. Try again.";
}
export default function AdminPage() {
  const [locale, setLocale] = useState<AdminLocale>("en");
  setActiveAdminLocale(locale);
  const [stage, setStage] = useState<Stage>("checking");
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [challengeToken, setChallengeToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const saved = window.localStorage.getItem("kaaj.admin.locale");
    if (saved === "bn" || saved === "en") changeLocale(saved);
  }, []);
  function changeLocale(next: AdminLocale) {
    setLocale(next);
    setActiveAdminLocale(next);
    window.localStorage.setItem("kaaj.admin.locale", next);
    document.documentElement.lang = next;
  }
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
    try {
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
      if (!response.ok)
        return setError(friendlyAdminError(new Error(readError(body))));
      setChallengeToken(body.data.challengeToken);
      setStage("totp");
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setBusy(false);
    }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/admin/totp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeToken, code: form.get("code") }),
      });
      const body = await response.json();
      if (!response.ok)
        return setError(friendlyAdminError(new Error(readError(body))));
      setAdmin(body.data);
      setStage("dashboard");
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      setAdmin(null);
      setChallengeToken("");
      setStage("login");
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setBusy(false);
    }
  }
  if (stage === "checking") {
    return (
      <main className="center">
        <div className="loader" aria-label={tr("Checking secure session")} />
      </main>
    );
  }
  if (stage === "login" || stage === "totp") {
    return (
      <main className="auth-shell">
        <div className="auth-locale locale-switch" aria-label={tr("Language")}>
          <button
            className={locale === "en" ? "active" : ""}
            onClick={() => changeLocale("en")}
          >
            EN
          </button>
          <button
            className={locale === "bn" ? "active" : ""}
            onClick={() => changeLocale("bn")}
          >
            বাংলা
          </button>
        </div>
        <section className="auth-story">
          <div className="brand-mark">{tr("\u0995")}</div>
          <p className="eyebrow">{tr("KAAJ \u00B7 OPERATIONS")}</p>
          <h1>{tr("Keep local work moving.")}</h1>
          <p>
            {tr(
              "Secure tools for the people supporting Rajshahi's workers and customers.",
            )}
          </p>
          <div className="security-note">
            <span>{tr("\u2713")}</span>{" "}
            {tr("Every operational action is recorded in the audit trail.")}
          </div>
        </section>
        <section className="auth-panel">
          <div className="auth-card">
            <p className="step">
              {tr("SECURE SIGN-IN \u00B7")}{" "}
              {tr(stage === "login" ? "1 OF 2" : "2 OF 2")}
            </p>
            <h2>
              {tr(stage === "login" ? "Welcome back" : "Verify it’s you")}
            </h2>
            <p className="muted">
              {tr(
                stage === "login"
                  ? "Use your assigned operations account."
                  : "Enter the six-digit code from your authenticator app.",
              )}
            </p>
            <form onSubmit={stage === "login" ? login : verify}>
              {stage === "login" ? (
                <>
                  <label>
                    {tr("Email address")}
                    <input
                      name="email"
                      type="email"
                      autoComplete="username"
                      required
                    />
                  </label>
                  <label>
                    {tr("Password")}
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
                  {tr("Authenticator code")}
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
                  {tr(error)}
                </p>
              )}
              <button className="primary" disabled={busy}>
                {tr(
                  busy
                    ? "Please wait…"
                    : stage === "login"
                      ? "Continue securely"
                      : "Open operations",
                )}
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
                  {tr("Use another account")}
                </button>
              )}
            </form>
          </div>
        </section>
      </main>
    );
  }
  return admin ? (
    <OperationsConsole
      admin={admin}
      busy={busy}
      logout={logout}
      locale={locale}
      onLocaleChange={changeLocale}
    />
  ) : null;
}
