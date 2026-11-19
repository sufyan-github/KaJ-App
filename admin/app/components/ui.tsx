"use client";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { friendlyAdminError, getActiveAdminLocale, tr } from "@/lib/admin-i18n";

export function useData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await adminApi<T>(path));
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => void load(), [load]);
  return { data, error, loading, reload: load };
}
export function State({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error: string;
  children: ReactNode;
}) {
  if (loading)
    return <div className="panel-state">{tr("Loading secure data\u2026")}</div>;
  if (error)
    return (
      <div className="panel-state error" role="alert">
        {error}
      </div>
    );
  return <>{children}</>;
}
export function ReasonDialog({
  title,
  confirmLabel,
  extra,
  onClose,
  onConfirm,
}: {
  title: string;
  confirmLabel: string;
  extra?: ReactNode;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title={title} onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          const reason = String(
            new FormData(event.currentTarget).get("reason"),
          );
          try {
            await onConfirm(reason);
          } catch (caught) {
            setError(friendlyAdminError(caught));
            setBusy(false);
          }
        }}
      >
        {extra}
        <label>
          {tr("Required operational reason")}
          <textarea name="reason" minLength={8} required autoFocus />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>
          {tr(busy ? "Applying…" : confirmLabel)}
        </button>
      </form>
    </Dialog>
  );
}
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={tr(title)}
      >
        <div className="dialog-head">
          <h2>{tr(title)}</h2>
          <button onClick={onClose} aria-label={tr("Close dialog")}>
            {tr("\u00D7")}
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section className="data-section">
      <div className="section-title">
        <div>
          <h2>{tr(title)}</h2>
          <p>{tr(note)}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
export function Summary({ count, label }: { count: number; label: string }) {
  return (
    <div className="summary">
      <strong>{formatNumber(count)}</strong>
      <span>
        {tr(label)} {tr("in this operational view")}
      </span>
    </div>
  );
}
export function DataTable({
  headers,
  children,
  empty,
}: {
  headers: string[];
  children: ReactNode;
  /** Shows "Nothing to show" instead of a blank body. */
  empty?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{tr(header)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {empty ? (
            <tr>
              <td className="empty-row" colSpan={headers.length}>
                {tr("Nothing to show")}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}
export function Badge({ value }: { value: string }) {
  return (
    <span className={`badge badge-${value.toLowerCase()}`}>
      {humanize(value)}
    </span>
  );
}
export function humanize(value: string) {
  return tr(
    value
      .replaceAll("_", " ")
      .replace(/([a-z])([A-Z])/gu, "$1 $2")
      .toLowerCase()
      .replace(/^./u, (letter) => letter.toUpperCase()),
  );
}
export function nextModerationLevel(value?: string | null) {
  return (
    (
      {
        NONE: "WARN",
        WARN: "RESTRICT",
        RESTRICT: "SUSPEND",
        SUSPEND: "BAN",
      } as Record<string, string>
    )[value ?? "NONE"] ?? null
  );
}
export function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} ${tr("min")}`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)} ${tr("h")}`;
  return `${Math.floor(minutes / 1440)} ${tr("days")}`;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(
    getActiveAdminLocale() === "bn" ? "bn-BD" : "en-BD",
    {
      dateStyle: "medium",
      timeStyle: "short",
      hour12: getActiveAdminLocale() !== "bn",
    },
  ).format(new Date(value));
}
export function formatPoisha(value: string) {
  return new Intl.NumberFormat(
    getActiveAdminLocale() === "bn" ? "bn-BD" : "en-BD",
    { style: "currency", currency: "BDT" },
  ).format(Number(value) / 100);
}
export function formatNumber(value: number) {
  return new Intl.NumberFormat(
    getActiveAdminLocale() === "bn" ? "bn-BD" : "en-BD",
  ).format(value);
}
export function formatBasisPoints(value?: number | null) {
  return value == null
    ? tr("Not enough decisions")
    : `${(value / 100).toFixed(1)}%`;
}
