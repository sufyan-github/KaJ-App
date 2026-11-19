"use client";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { adminApi } from "@/lib/admin-api";
import { type AdminRoute, canCall } from "@/lib/permissions";
import { friendlyAdminError, getActiveAdminLocale, tr } from "@/lib/admin-i18n";

const RoleContext = createContext<string | null>(null);

/** The signed-in operator's admin role, for hiding what it cannot use. */
export const RoleProvider = RoleContext.Provider;

/** `can("POST users/:id/moderation")`: whether this role may call a route. */
export function useCan() {
  const role = useContext(RoleContext);
  return (route: AdminRoute) => canCall(role, route);
}

/** Renders its children only when the role may call every `route`. */
export function Can({
  route,
  children,
}: {
  route: AdminRoute | AdminRoute[];
  children: ReactNode;
}) {
  const can = useCan();
  const routes = Array.isArray(route) ? route : [route];
  return routes.every(can) ? <>{children}</> : null;
}

type Page<T> = { items: T[]; nextCursor: string | null; total?: number };

/**
 * A cursor-paged list: `params` (search, filters) are sent with every page;
 * changing them starts again from the first page. Empty params are dropped.
 */
export function usePagedData<T extends { id: string }>(
  path: string,
  params: Record<string, string | undefined> = {},
  limit = 30,
) {
  const query = new URLSearchParams({ limit: String(limit) });
  for (const [key, value] of Object.entries(params))
    if (value) query.set(key, value);
  const base = `${path}?${query.toString()}`;
  const [items, setItems] = useState<T[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const page = await adminApi<Page<T>>(base);
      setItems(page.items);
      setNextCursor(page.nextCursor ?? null);
      setTotal(page.total);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [base]);
  useEffect(() => void load(), [load]);
  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await adminApi<Page<T>>(
        `${base}&cursor=${encodeURIComponent(nextCursor)}`,
      );
      setItems((current) => [
        ...current,
        ...page.items.filter((item) => !current.some((c) => c.id === item.id)),
      ]);
      setNextCursor(page.nextCursor ?? null);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoadingMore(false);
    }
  }
  return {
    items,
    total,
    error,
    loading,
    loadingMore,
    hasMore: !!nextCursor,
    loadMore,
    reload: load,
  };
}

/** Search box (applied on Enter or the button) plus any filter controls. */
export function ListToolbar({
  search,
  onSearch,
  placeholder = "Search",
  children,
}: {
  search?: string;
  onSearch?: (value: string) => void;
  placeholder?: string;
  children?: ReactNode;
}) {
  const [draft, setDraft] = useState(search ?? "");
  return (
    <div className="list-toolbar">
      {onSearch && (
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch(draft.trim());
          }}
        >
          <input
            type="search"
            aria-label={tr(placeholder)}
            placeholder={tr(placeholder)}
            value={draft}
            maxLength={120}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit">{tr("Search")}</button>
        </form>
      )}
      {children}
    </div>
  );
}

/** A labelled filter select; "" means no filter. */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="filter">
      {tr(label)}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([key, name]) => (
          <option key={key} value={key}>
            {tr(name)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function LoadMore({
  hasMore,
  loading,
  shown,
  total,
  onClick,
}: {
  hasMore: boolean;
  loading: boolean;
  shown: number;
  total?: number;
  onClick: () => void;
}) {
  return (
    <div className="load-more">
      <span className="muted">
        {total === undefined
          ? `${tr("Showing")} ${formatNumber(shown)}`
          : `${tr("Showing")} ${formatNumber(shown)} ${tr("of")} ${formatNumber(total)}`}
      </span>
      {hasMore && (
        <button onClick={onClick} disabled={loading}>
          {tr(loading ? "Loading…" : "Load more")}
        </button>
      )}
    </div>
  );
}

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
