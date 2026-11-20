"use client";
import { FormEvent, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { friendlyAdminError, tr } from "@/lib/admin-i18n";
import {
  Can,
  DataTable,
  Dialog,
  LoadMore,
  State,
  formatDate,
  humanize,
  usePagedData,
} from "../ui";

type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  created_at: string;
  ip: string | null;
  ua: string | null;
  before_json: unknown;
  after_json: unknown;
  actor: { email: string | null } | null;
};

type Filters = {
  action?: string;
  entity?: string;
  entityId?: string;
  actorEmail?: string;
  from?: string;
  to?: string;
  changesOnly?: string;
};

/** "2026-11-20" (a local date input) → the start of that day as ISO. */
function dayStart(value: string, plusDays = 0) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + plusDays);
  return date.toISOString();
}

/** Filters, details and (ADMIN) CSV export of the audit trail. */
export function AuditTrail() {
  const [filters, setFilters] = useState<Filters>({ changesOnly: "true" });
  const list = usePagedData<AuditRow>("audit-logs", filters, 50);
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    setFilters({
      action: text("action").toUpperCase() || undefined,
      entity: text("entity").toUpperCase() || undefined,
      entityId: text("entityId") || undefined,
      actorEmail: text("actorEmail").toLowerCase() || undefined,
      from: dayStart(text("from")),
      // The "to" day is included: the filter is exclusive, so the next day.
      to: dayStart(text("to"), 1),
      changesOnly: form.get("changesOnly") === "on" ? "true" : undefined,
    });
  }

  async function exportCsv() {
    setExporting(true);
    setError("");
    setNotice("");
    try {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(filters))
        if (value) query.set(key, value);
      const result = await adminApi<{
        filename: string;
        csv: string;
        rowCount: number;
        truncated: boolean;
      }>(`audit-logs/export?${query.toString()}`);
      const url = URL.createObjectURL(
        new Blob([result.csv], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
      setNotice(
        tr(
          result.truncated
            ? `Exported the newest ${result.rowCount} rows. Narrow the filters to export the rest.`
            : `Exported ${result.rowCount} rows.`,
        ),
      );
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <form
        className="audit-filters"
        onSubmit={apply}
        aria-label={tr("Audit filters")}
      >
        <label>
          {tr("Action")}
          <input
            name="action"
            placeholder="ADMIN_STAFF_INVITED"
            pattern="[A-Za-z0-9_]{2,80}"
          />
        </label>
        <label>
          {tr("Entity")}
          <input
            name="entity"
            placeholder="USER"
            pattern="[A-Za-z0-9_]{2,80}"
          />
        </label>
        <label>
          {tr("Entity id")}
          <input name="entityId" />
        </label>
        <label>
          {tr("Actor email")}
          <input name="actorEmail" type="email" />
        </label>
        <label>
          {tr("From")}
          <input name="from" type="date" />
        </label>
        <label>
          {tr("To")}
          <input name="to" type="date" />
        </label>
        <label className="checkbox">
          <input name="changesOnly" type="checkbox" defaultChecked />
          {tr("Changes only (hide list views)")}
        </label>
        <div className="actions">
          <button type="submit">{tr("Apply filters")}</button>
          <Can route="GET audit-logs/export">
            <button
              type="button"
              className="primary small-button"
              disabled={exporting}
              onClick={() => void exportCsv()}
            >
              {tr(exporting ? "Exporting…" : "Export CSV")}
            </button>
          </Can>
        </div>
      </form>
      {notice && <p className="success">{notice}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <State loading={list.loading} error={list.error}>
        <DataTable
          headers={["Action", "Entity", "Actor", "Time", "Details"]}
          empty={!list.items.length}
        >
          {list.items.map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{humanize(item.action)}</strong>
                <small>{item.action}</small>
              </td>
              <td>
                {item.entity}
                <small>{item.entity_id}</small>
              </td>
              <td>{item.actor?.email ?? tr("System")}</td>
              <td>{formatDate(item.created_at)}</td>
              <td className="actions">
                <button onClick={() => setSelected(item)}>{tr("View")}</button>
              </td>
            </tr>
          ))}
        </DataTable>
        <LoadMore
          hasMore={list.hasMore}
          loading={list.loadingMore}
          shown={list.items.length}
          onClick={() => void list.loadMore()}
        />
      </State>
      {selected && (
        <Dialog
          title={humanize(selected.action)}
          onClose={() => setSelected(null)}
        >
          <dl className="credentials">
            <dt>{tr("Time")}</dt>
            <dd>{formatDate(selected.created_at)}</dd>
            <dt>{tr("Actor")}</dt>
            <dd>{selected.actor?.email ?? tr("System")}</dd>
            <dt>{tr("Entity")}</dt>
            <dd>
              {selected.entity} {selected.entity_id}
            </dd>
            <dt>{tr("Address")}</dt>
            <dd>{selected.ip ?? "—"}</dd>
            <dt>{tr("Browser")}</dt>
            <dd>{selected.ua ?? "—"}</dd>
          </dl>
          <div className="diff-columns">
            <section>
              <strong>{tr("Before")}</strong>
              <pre>
                {JSON.stringify(selected.before_json, null, 2) ?? "null"}
              </pre>
            </section>
            <section>
              <strong>{tr("After")}</strong>
              <pre>
                {JSON.stringify(selected.after_json, null, 2) ?? "null"}
              </pre>
            </section>
          </div>
        </Dialog>
      )}
    </>
  );
}
