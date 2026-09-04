"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";

import { adminApi, json } from "@/lib/admin-api";

type Admin = { email: string; role: string; userId: string };
type ModuleKey =
  | "dashboard"
  | "users"
  | "reports"
  | "jobs"
  | "applications"
  | "verification"
  | "categories"
  | "locations"
  | "config"
  | "flags"
  | "disputes"
  | "notifications"
  | "analytics"
  | "audit";

const modules: Array<[ModuleKey, string, string]> = [
  ["dashboard", "Dashboard", "Live marketplace health"],
  ["users", "Users", "Support and moderation"],
  ["reports", "Safety reports", "Human review and progressive action"],
  ["jobs", "Jobs", "Lifecycle rescue"],
  ["applications", "Applications", "Unstick applications"],
  ["verification", "Verification", "Document review queue"],
  ["categories", "Categories", "D12 safety policies"],
  ["locations", "Locations", "Launch service areas"],
  ["config", "Configuration", "Preview and revert"],
  ["flags", "Feature flags", "Percentage rollouts"],
  ["disputes", "Disputes", "Evidence and resolution"],
  ["notifications", "Notifications", "Campaign dry-runs"],
  ["analytics", "Analytics", "Marketplace health"],
  ["audit", "Audit trail", "Who changed what"],
];

export function OperationsConsole({
  admin,
  busy,
  logout,
}: {
  admin: Admin;
  busy: boolean;
  logout: () => Promise<void>;
}) {
  const [active, setActive] = useState<ModuleKey>("dashboard");
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
          {modules.map(([key, name], index) => (
            <button
              className={active === key ? "active" : ""}
              key={key}
              onClick={() => setActive(key)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {name}
            </button>
          ))}
        </nav>
        <div className="account">
          <div className="avatar">{admin.email[0]?.toUpperCase()}</div>
          <div>
            <strong>{admin.email}</strong>
            <span>{admin.role}</span>
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
            <h1>{modules.find(([key]) => key === active)?.[1]}</h1>
            <p>{modules.find(([key]) => key === active)?.[2]}</p>
          </div>
          <div className="session-pill">
            <span /> Secure session · 30 min
          </div>
        </header>
        <div className="notice compact">
          <strong>Every view and action is audited.</strong>
          <span>
            High-risk changes require a reason and explicit confirmation.
          </span>
        </div>
        <ModuleView active={active} />
      </section>
    </main>
  );
}

function ModuleView({ active }: { active: ModuleKey }) {
  if (active === "dashboard") return <Dashboard />;
  if (active === "users") return <Users />;
  if (active === "reports") return <Reports />;
  if (active === "jobs") return <Jobs />;
  if (active === "applications") return <Applications />;
  if (active === "verification") return <Verification />;
  if (active === "categories") return <Categories />;
  if (active === "locations") return <Locations />;
  if (active === "config") return <Configuration />;
  if (active === "flags") return <Flags />;
  if (active === "disputes") return <Disputes />;
  if (active === "notifications") return <Notifications />;
  if (active === "analytics") return <Analytics />;
  return <AuditTrail />;
}

function useData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await adminApi<T>(path));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => void load(), [load]);
  return { data, error, loading, reload: load };
}

function State({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error: string;
  children: ReactNode;
}) {
  if (loading) return <div className="panel-state">Loading secure data…</div>;
  if (error)
    return (
      <div className="panel-state error" role="alert">
        {error}
      </div>
    );
  return <>{children}</>;
}

function Dashboard() {
  const { data, loading, error } = useData<{
    counts: Record<string, number>;
    stuckJobs: Array<{
      id: string;
      title: string;
      status: string;
      updated_at: string;
    }>;
  }>("dashboard");
  return (
    <State loading={loading} error={error}>
      <div className="metric-grid">
        {Object.entries(data?.counts ?? {}).map(([key, value]) => (
          <article key={key}>
            <span>{humanize(key)}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <Section
        title="Stuck jobs"
        note="Non-terminal jobs unchanged for more than two hours"
      >
        <DataTable headers={["Job", "Status", "Last change"]}>
          {(data?.stuckJobs ?? []).map((job) => (
            <tr key={job.id}>
              <td>
                <strong>{job.title}</strong>
                <small>{job.id}</small>
              </td>
              <td>
                <Badge value={job.status} />
              </td>
              <td>{formatDate(job.updated_at)}</td>
            </tr>
          ))}
        </DataTable>
      </Section>
    </State>
  );
}

function Users() {
  const { data, loading, error, reload } = useData<{
    items: UserItem[];
    total: number;
  }>("users?limit=100");
  const [action, setAction] = useState<{
    user: UserItem;
    level?: string;
    kind: "moderate" | "restore" | "reset";
  } | null>(null);
  return (
    <State loading={loading} error={error}>
      <Summary count={data?.total ?? 0} label="users" />
      <DataTable
        headers={["Person", "Roles", "Trust", "Moderation", "Actions"]}
      >
        {(data?.items ?? []).map((user) => (
          <tr key={user.id}>
            <td>
              <strong>{user.name}</strong>
              <small>{user.phone ?? user.email ?? user.id}</small>
            </td>
            <td>{user.roles.join(", ")}</td>
            <td>
              <Badge value={user.trustLevel} />
            </td>
            <td>
              <Badge value={user.status} />
              <small>{humanize(user.moderationLevel ?? "NONE")}</small>
              {user.reverificationRequired && (
                <small>Identity re-verification required</small>
              )}
            </td>
            <td className="actions">
              <button
                onClick={() =>
                  setAction({
                    user,
                    level: nextModerationLevel(user.moderationLevel),
                    kind: "moderate",
                  })
                }
                disabled={!nextModerationLevel(user.moderationLevel)}
              >
                Next:{" "}
                {humanize(nextModerationLevel(user.moderationLevel) ?? "final")}
              </button>
              <button
                onClick={() => setAction({ user, kind: "restore" })}
                disabled={
                  (user.moderationLevel ?? "NONE") === "NONE" ||
                  user.reverificationRequired
                }
              >
                Restore
              </button>
              <button onClick={() => setAction({ user, kind: "reset" })}>
                Reset sessions
              </button>
            </td>
          </tr>
        ))}
      </DataTable>
      {action && (
        <ReasonDialog
          title={
            action.kind === "reset"
              ? "Reset all sessions"
              : action.kind === "restore"
                ? "Restore user"
                : `${humanize(action.level!)} moderation step`
          }
          confirmLabel={
            action.kind === "reset"
              ? "Reset sessions"
              : action.kind === "restore"
                ? "Confirm restore"
                : `Confirm ${humanize(action.level!)}`
          }
          onClose={() => setAction(null)}
          onConfirm={async (reason) => {
            const path =
              action.kind === "reset"
                ? `users/${action.user.id}/reset-sessions`
                : action.kind === "restore"
                  ? `users/${action.user.id}/moderation/restore`
                  : `users/${action.user.id}/moderation`;
            const body =
              action.kind === "reset"
                ? { reason }
                : action.kind === "restore"
                  ? { reason }
                  : { reason, action: action.level };
            await adminApi(path, json("POST", body));
            setAction(null);
            await reload();
          }}
        />
      )}
    </State>
  );
}

type UserItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  roles: string[];
  trustLevel: string;
  status: string;
  moderationLevel?: string;
  restrictionEndsAt?: string | null;
  reverificationRequired?: boolean;
};

function Reports() {
  const { data, loading, error, reload } = useData<{
    items: ReportItem[];
    total: number;
  }>("reports?limit=100");
  const [selected, setSelected] = useState<ReportItem | null>(null);
  return (
    <State loading={loading} error={error}>
      <Summary count={data?.total ?? 0} label="safety reports" />
      <DataTable
        headers={["Report", "People", "Status", "Evidence", "Actions"]}
      >
        {(data?.items ?? []).map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{humanize(item.reasonCode)}</strong>
              <small>
                {humanize(item.targetType)} · {formatDate(item.createdAt)}
              </small>
            </td>
            <td>
              <strong>{item.subject?.name ?? "No user subject"}</strong>
              <small>Reported by {item.reporter.name}</small>
              {item.subject && (
                <small>
                  Current level: {humanize(item.subject.moderationLevel)}
                </small>
              )}
            </td>
            <td>
              <Badge value={item.status} />
            </td>
            <td>{item.description}</td>
            <td className="actions">
              {item.status === "OPEN" && (
                <button
                  onClick={async () => {
                    await adminApi(
                      `reports/${item.id}/review`,
                      json("POST", {}),
                    );
                    await reload();
                  }}
                >
                  Start review
                </button>
              )}
              {(item.status === "OPEN" || item.status === "UNDER_REVIEW") && (
                <button onClick={() => setSelected(item)}>Decide</button>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
      {selected && (
        <ReportDecisionDialog
          report={selected}
          onClose={() => setSelected(null)}
          onDone={async () => {
            setSelected(null);
            await reload();
          }}
        />
      )}
    </State>
  );
}

type ReportItem = {
  id: string;
  targetType: string;
  targetId: string;
  reasonCode: string;
  description: string | null;
  status: string;
  createdAt: string;
  reporter: { id: string; name: string };
  subject: {
    id: string;
    name: string;
    status: string;
    moderationLevel: string;
    reverificationRequired: boolean;
  } | null;
};

function ReportDecisionDialog({
  report,
  onClose,
  onDone,
}: {
  report: ReportItem;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [status, setStatus] = useState("ACTIONED");
  const [action, setAction] = useState(
    nextModerationLevel(report.subject?.moderationLevel),
  );
  const [reason, setReason] = useState("");
  const [durationDays, setDurationDays] = useState("7");
  const [requireReverification, setRequireReverification] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog title="Resolve safety report" onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            await adminApi(
              `reports/${report.id}/decision`,
              json("POST", {
                status,
                reason,
                ...(status === "ACTIONED"
                  ? {
                      action,
                      durationDays: Number(durationDays),
                      requireReverification,
                    }
                  : {}),
              }),
            );
            await onDone();
          } catch (caught) {
            setError((caught as Error).message);
          }
        }}
      >
        <label>
          Decision
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="ACTIONED">Action supported</option>
            <option value="DISMISSED">Dismiss report</option>
          </select>
        </label>
        {status === "ACTIONED" && (
          <>
            <label>
              Next moderation step
              <select
                value={action ?? ""}
                onChange={(event) => setAction(event.target.value)}
              >
                {action && <option value={action}>{humanize(action)}</option>}
              </select>
            </label>
            {(action === "RESTRICT" || action === "SUSPEND") && (
              <label>
                Duration in days
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={durationDays}
                  onChange={(event) => setDurationDays(event.target.value)}
                />
              </label>
            )}
            {action === "RESTRICT" && (
              <label>
                <input
                  type="checkbox"
                  checked={requireReverification}
                  onChange={(event) =>
                    setRequireReverification(event.target.checked)
                  }
                />
                Require identity re-verification
              </label>
            )}
          </>
        )}
        <label>
          Required decision reason
          <textarea
            required
            minLength={10}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={status === "ACTIONED" && !action}>
            Confirm decision
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function Jobs() {
  const { data, loading, error, reload } = useData<{
    items: JobItem[];
    total: number;
  }>("jobs?limit=100");
  const [selected, setSelected] = useState<JobItem | null>(null);
  const [target, setTarget] = useState("SUSPENDED");
  return (
    <State loading={loading} error={error}>
      <Summary count={data?.total ?? 0} label="jobs" />
      <DataTable headers={["Job", "Poster", "Status", "Activity", "Actions"]}>
        {(data?.items ?? []).map((job) => (
          <tr key={job.id}>
            <td>
              <strong>{job.title}</strong>
              <small>{job.id}</small>
            </td>
            <td>{job.poster.name}</td>
            <td>
              <Badge value={job.status} />
            </td>
            <td>
              {job.applicationsCount} applications · {job.assignmentsCount}{" "}
              assignments
            </td>
            <td className="actions">
              <button
                onClick={() => {
                  setTarget("SUSPENDED");
                  setSelected(job);
                }}
              >
                Force transition
              </button>
              <button
                onClick={async () => {
                  await adminApi(
                    `jobs/${job.id}/feature`,
                    json("POST", {
                      isFeatured: !job.isFeatured,
                      reason:
                        "Operations review changed marketplace featuring.",
                    }),
                  );
                  await reload();
                }}
              >
                {job.isFeatured ? "Unfeature" : "Feature"}
              </button>
            </td>
          </tr>
        ))}
      </DataTable>
      {selected && (
        <ReasonDialog
          title={`Force transition: ${selected.title}`}
          confirmLabel="Apply forced transition"
          extra={
            <label>
              Target status
              <select
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              >
                {JOB_STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
          }
          onClose={() => setSelected(null)}
          onConfirm={async (reason) => {
            await adminApi(
              `jobs/${selected.id}/force-transition`,
              json("POST", { toStatus: target, reason }),
            );
            setSelected(null);
            await reload();
          }}
        />
      )}
    </State>
  );
}

const JOB_STATUSES = [
  "PUBLISHED",
  "APPLICATIONS_OPEN",
  "CONFIRMATION_PENDING",
  "CONFIRMED",
  "UPCOMING",
  "IN_PROGRESS",
  "SUBMITTED",
  "CUSTOMER_REVIEW",
  "COMPLETED",
  "EXPIRED",
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_WORKER",
  "SUSPENDED",
];
type JobItem = {
  id: string;
  title: string;
  status: string;
  isFeatured: boolean;
  poster: { name: string };
  applicationsCount: number;
  assignmentsCount: number;
};

function Applications() {
  const { data, loading, error, reload } = useData<{
    items: Array<{
      id: string;
      status: string;
      job: { title: string };
      worker: { name: string };
    }>;
  }>("applications?limit=100");
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <State loading={loading} error={error}>
      <DataTable headers={["Job", "Worker", "Status", "Action"]}>
        {(data?.items ?? []).map((item) => (
          <tr key={item.id}>
            <td>{item.job.title}</td>
            <td>{item.worker.name}</td>
            <td>
              <Badge value={item.status} />
            </td>
            <td>
              <button
                className="table-button"
                onClick={() => setSelected(item.id)}
              >
                Unstick
              </button>
            </td>
          </tr>
        ))}
      </DataTable>
      {selected && (
        <ReasonDialog
          title="Return application to pending"
          confirmLabel="Unstick application"
          onClose={() => setSelected(null)}
          onConfirm={async (reason) => {
            await adminApi(
              `applications/${selected}/unstick`,
              json("POST", { status: "PENDING", reason }),
            );
            setSelected(null);
            await reload();
          }}
        />
      )}
    </State>
  );
}

function Verification() {
  const { data, loading, error, reload } = useData<{
    items: VerificationItem[];
  }>("verification-requests?limit=100");
  const [decision, setDecision] = useState<{
    item: VerificationItem;
    status: "APPROVED" | "REJECTED";
  } | null>(null);
  const [documentView, setDocumentView] = useState<{
    downloadUrl: string;
    mime: string;
    watermark: string;
  } | null>(null);
  return (
    <State loading={loading} error={error}>
      <DataTable
        headers={["Person", "Kind", "Documents", "Status", "Decision"]}
      >
        {(data?.items ?? []).map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{item.user.name}</strong>
              <small>{item.user.trustLevel}</small>
            </td>
            <td>{item.kind}</td>
            <td className="actions">
              {item.documents.map((document) => (
                <button
                  key={document.id}
                  onClick={async () =>
                    setDocumentView(
                      await adminApi(`verification-documents/${document.id}`),
                    )
                  }
                >
                  View {humanize(document.kind)}
                </button>
              ))}
              {!item.documents.length && "None"}
            </td>
            <td>
              <Badge value={item.status} />
            </td>
            <td className="actions">
              <button onClick={() => setDecision({ item, status: "APPROVED" })}>
                Approve
              </button>
              <button onClick={() => setDecision({ item, status: "REJECTED" })}>
                Reject
              </button>
            </td>
          </tr>
        ))}
      </DataTable>
      {decision && (
        <ReasonDialog
          title={`${humanize(decision.status)} ${decision.item.kind} verification`}
          confirmLabel={`Confirm ${humanize(decision.status)}`}
          onClose={() => setDecision(null)}
          onConfirm={async (reason) => {
            await adminApi(
              `verification-requests/${decision.item.id}/decision`,
              json("POST", { status: decision.status, reason }),
            );
            setDecision(null);
            await reload();
          }}
        />
      )}
      {documentView && (
        <Dialog
          title="Sensitive verification document"
          onClose={() => setDocumentView(null)}
        >
          <div className="document-viewer">
            {documentView.mime.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={documentView.downloadUrl} alt="Verification evidence" />
            ) : (
              <iframe
                src={documentView.downloadUrl}
                title="Verification evidence"
              />
            )}
            <span>{documentView.watermark}</span>
          </div>
          <p className="muted">
            This view is time-limited and recorded in the audit trail.
          </p>
        </Dialog>
      )}
    </State>
  );
}
type VerificationItem = {
  id: string;
  kind: string;
  status: string;
  user: { name: string; trustLevel: string };
  documents: Array<{ id: string; kind: string; mime: string }>;
};

function Categories() {
  const { data, loading, error, reload } = useData<{ items: CategoryItem[] }>(
    "categories",
  );
  async function toggle(item: CategoryItem, key: keyof CategoryItem) {
    const { id: _id, ...body } = item;
    await adminApi(
      `categories/${item.id}`,
      json("PUT", { ...body, [key]: !item[key] }),
    );
    await reload();
  }
  return (
    <State loading={loading} error={error}>
      <DataTable
        headers={["Category", "Minimum age", "Safety controls", "Active"]}
      >
        {(data?.items ?? []).map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{item.nameEn}</strong>
              <small>
                {item.nameBn} · {item.slug}
              </small>
            </td>
            <td>{item.minAge}+</td>
            <td className="toggle-list">
              <button
                className={item.requiresManualApproval ? "on" : ""}
                onClick={() => toggle(item, "requiresManualApproval")}
              >
                Manual approval
              </button>
              <button
                className={item.requiresIdentity ? "on" : ""}
                onClick={() => toggle(item, "requiresIdentity")}
              >
                Identity
              </button>
              <button
                className={item.requiresCertificate ? "on" : ""}
                onClick={() => toggle(item, "requiresCertificate")}
              >
                Certificate
              </button>
              <button
                className={item.unsafeForStudents ? "on danger" : ""}
                onClick={() => toggle(item, "unsafeForStudents")}
              >
                Student restriction
              </button>
            </td>
            <td>
              <button
                className={`switch ${item.isActive ? "on" : ""}`}
                aria-label={`Toggle ${item.nameEn}`}
                onClick={() => toggle(item, "isActive")}
              >
                <span />
              </button>
            </td>
          </tr>
        ))}
      </DataTable>
    </State>
  );
}
type CategoryItem = {
  id: string;
  parentId?: string;
  slug: string;
  nameEn: string;
  nameBn: string;
  icon?: string;
  sortOrder: number;
  isActive: boolean;
  requiresManualApproval: boolean;
  minAge: number;
  requiresCertificate: boolean;
  requiresIdentity: boolean;
  requiresPosterIdentity: boolean;
  requiresReferences: number;
  requiresLicence: boolean;
  safetyNotice?: string;
  unsafeForStudents: boolean;
};

function Locations() {
  const { data, loading, error, reload } = useData<{ items: LocationItem[] }>(
    "locations",
  );
  const [adding, setAdding] = useState(false);
  return (
    <State loading={loading} error={error}>
      <div className="toolbar">
        <Summary count={data?.items.length ?? 0} label="locations" />
        <button
          className="primary small-button"
          onClick={() => setAdding(true)}
        >
          Add location
        </button>
      </div>
      <DataTable headers={["Location", "Type", "Coordinates", "Active"]}>
        {(data?.items ?? []).map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{item.nameEn}</strong>
              <small>{item.nameBn}</small>
            </td>
            <td>
              <Badge value={item.type} />
            </td>
            <td>
              {item.lat ?? "—"}, {item.lng ?? "—"}
            </td>
            <td>
              <button
                className={`switch ${item.isActive ? "on" : ""}`}
                aria-label={`Toggle ${item.nameEn}`}
                onClick={async () => {
                  const { id: _id, ...body } = item;
                  await adminApi(
                    `locations/${item.id}`,
                    json("PUT", { ...body, isActive: !item.isActive }),
                  );
                  await reload();
                }}
              >
                <span />
              </button>
            </td>
          </tr>
        ))}
      </DataTable>
      {adding && (
        <LocationDialog
          locations={data?.items ?? []}
          onClose={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await reload();
          }}
        />
      )}
    </State>
  );
}
type LocationItem = {
  id: string;
  parentId: string | null;
  nameEn: string;
  nameBn: string;
  type: string;
  lat: string | null;
  lng: string | null;
  radiusKm: string | null;
  isActive: boolean;
};

function LocationDialog({
  locations,
  onClose,
  onSaved,
}: {
  locations: LocationItem[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [type, setType] = useState("CITY");
  return (
    <Dialog title="Add service location" onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          try {
            await adminApi(
              "locations",
              json("POST", {
                type: form.get("type"),
                parentId: type === "CITY" ? undefined : form.get("parentId"),
                nameEn: form.get("nameEn"),
                nameBn: form.get("nameBn"),
                isActive: true,
              }),
            );
            await onSaved();
          } catch (caught) {
            setError((caught as Error).message);
          }
        }}
      >
        <label>
          Type
          <select
            name="type"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option>CITY</option>
            <option>THANA</option>
            <option>AREA</option>
          </select>
        </label>
        {type !== "CITY" && (
          <label>
            Parent location
            <select name="parentId" required>
              <option value="">Select a parent</option>
              {locations
                .filter((location) =>
                  type === "THANA"
                    ? location.type === "CITY"
                    : location.type === "THANA",
                )
                .map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.nameEn}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label>
          English name
          <input name="nameEn" required />
        </label>
        <label>
          Bangla name
          <input name="nameBn" required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary">Create location</button>
      </form>
    </Dialog>
  );
}

function Configuration() {
  const { data, loading, error, reload } = useData<{
    items: ConfigItem[];
    revisions: Array<{
      id: string;
      key: string;
      reason: string;
      created_at: string;
    }>;
  }>("config");
  const [selectedKey, setSelectedKey] = useState("platform.fees");
  const selected = data?.items.find((item) => item.key === selectedKey);
  const [draft, setDraft] = useState("");
  const [preview, setPreview] = useState<{ changedFields: string[] } | null>(
    null,
  );
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (selected) {
      setDraft(JSON.stringify(selected.value, null, 2));
      setPreview(null);
    }
  }, [selected]);
  async function previewChange() {
    const value = JSON.parse(draft);
    setPreview(
      await adminApi(
        `config/${encodeURIComponent(selectedKey)}/preview`,
        json("POST", {
          value,
          reason: "Preview platform configuration change.",
          confirm: false,
        }),
      ),
    );
  }
  async function save() {
    const value = JSON.parse(draft);
    await adminApi(
      `config/${encodeURIComponent(selectedKey)}`,
      json("PUT", {
        value,
        reason: "Confirmed operations configuration update.",
        expectedUpdatedAt: selected?.updatedAt,
        confirm: true,
      }),
    );
    setMessage("Configuration saved with a reversible revision.");
    setPreview(null);
    await reload();
  }
  return (
    <State loading={loading} error={error}>
      <div className="config-layout">
        <section className="config-editor">
          <label>
            Configuration key
            <select
              value={selectedKey}
              onChange={(event) => setSelectedKey(event.target.value)}
            >
              {(data?.items ?? []).map((item) => (
                <option key={item.key}>{item.key}</option>
              ))}
            </select>
          </label>
          <label>
            JSON value
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={13}
              spellCheck={false}
            />
          </label>
          <div className="actions">
            <button onClick={previewChange}>Preview diff</button>
            {preview && (
              <button className="primary small-button" onClick={save}>
                Confirm change
              </button>
            )}
          </div>
          {preview && (
            <div className="diff-box">
              <strong>Changed fields</strong>
              <span>{preview.changedFields.join(", ") || "No changes"}</span>
            </div>
          )}
          {message && <p className="success">{message}</p>}
        </section>
        <Section title="Revision history" note="Every version can be reverted">
          {(data?.revisions ?? []).map((revision) => (
            <div className="revision" key={revision.id}>
              <div>
                <strong>{revision.key}</strong>
                <small>
                  {revision.reason} · {formatDate(revision.created_at)}
                </small>
              </div>
              <button
                onClick={async () => {
                  await adminApi(
                    `config/revisions/${revision.id}/revert`,
                    json("POST", {
                      reason:
                        "Operations rollback after reviewing the revision.",
                    }),
                  );
                  await reload();
                }}
              >
                Revert
              </button>
            </div>
          ))}
        </Section>
      </div>
    </State>
  );
}
type ConfigItem = { key: string; value: unknown; updatedAt: string };

function Flags() {
  const { data, loading, error, reload } = useData<{
    items: Array<{ key: string; isEnabled: boolean; rolloutPercent: number }>;
  }>("flags");
  return (
    <State loading={loading} error={error}>
      <DataTable headers={["Flag", "Enabled", "Rollout", "Save"]}>
        {(data?.items ?? []).map((item) => (
          <FlagRow key={item.key} item={item} reload={reload} />
        ))}
      </DataTable>
    </State>
  );
}
function FlagRow({
  item,
  reload,
}: {
  item: { key: string; isEnabled: boolean; rolloutPercent: number };
  reload: () => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(item.isEnabled);
  const [rollout, setRollout] = useState(item.rolloutPercent);
  return (
    <tr>
      <td>
        <strong>{item.key}</strong>
      </td>
      <td>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
      </td>
      <td>
        <input
          className="number-input"
          type="number"
          min="0"
          max="100"
          value={rollout}
          onChange={(event) => setRollout(Number(event.target.value))}
        />
        %
      </td>
      <td>
        <button
          className="table-button"
          onClick={async () => {
            await adminApi(
              `flags/${item.key}`,
              json("PUT", {
                isEnabled: enabled,
                rolloutPercent: rollout,
                reason: "Confirmed feature rollout adjustment.",
              }),
            );
            await reload();
          }}
        >
          Save
        </button>
      </td>
    </tr>
  );
}

function Disputes() {
  const { data, loading, error, reload } = useData<{ items: DisputeItem[] }>(
    "disputes?limit=100",
  );
  const [selected, setSelected] = useState<DisputeItem | null>(null);
  return (
    <State loading={loading} error={error}>
      <DataTable headers={["Job", "Reason", "Evidence", "Status", "Action"]}>
        {(data?.items ?? []).map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{item.job.title}</strong>
              <small>{item.id}</small>
            </td>
            <td>
              {item.reason_code}
              <small>{item.description}</small>
            </td>
            <td>{item.evidence.length}</td>
            <td>
              <Badge value={item.status} />
              {item.sla?.resolutionOverdue && <small>Resolution overdue</small>}
            </td>
            <td>
              {!item.firstResponseAt && (
                <button
                  className="table-button"
                  onClick={async () => {
                    await adminApi(
                      `disputes/${item.id}/review`,
                      json("POST", {}),
                    );
                    await reload();
                  }}
                >
                  Start review
                </button>
              )}
              <button
                className="table-button"
                onClick={() => setSelected(item)}
              >
                Resolve
              </button>
            </td>
          </tr>
        ))}
      </DataTable>
      {selected && (
        <DisputeDialog
          item={selected}
          onClose={() => setSelected(null)}
          onSaved={async () => {
            setSelected(null);
            await reload();
          }}
        />
      )}
    </State>
  );
}
type DisputeItem = {
  id: string;
  reason_code: string;
  description: string;
  status: string;
  evidence: unknown[];
  firstResponseAt?: string | null;
  sla?: { resolutionOverdue: boolean };
  job: { title: string };
  payment?: { amountPoisha: string } | null;
};
function DisputeDialog({
  item,
  onClose,
  onSaved,
}: {
  item: DisputeItem;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  return (
    <Dialog title={`Resolve dispute: ${item.job.title}`} onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          try {
            await adminApi(
              `disputes/${item.id}/resolve`,
              json("POST", {
                resolution: form.get("resolution"),
                reason: form.get("reason"),
                decision: form.get("decision"),
                refundPoisha: Number(form.get("refundPoisha")),
                releasePoisha: Number(form.get("releasePoisha")),
                jobStatus: form.get("jobStatus"),
              }),
            );
            await onSaved();
          } catch (caught) {
            setError((caught as Error).message);
          }
        }}
      >
        <label>
          Resolution
          <textarea name="resolution" minLength={8} required />
        </label>
        <label>
          Decision reason
          <textarea name="reason" minLength={8} required />
        </label>
        <label>
          Decision
          <select name="decision" defaultValue="RELEASE_FULL">
            <option>RELEASE_FULL</option>
            <option>RELEASE_PARTIAL</option>
            <option>REFUND_FULL</option>
            <option>REFUND_PARTIAL</option>
            <option>SPLIT</option>
          </select>
        </label>
        {item.payment?.amountPoisha && (
          <p>Amount to allocate: {item.payment.amountPoisha} poisha</p>
        )}
        <label>
          Cash refund to record (poisha)
          <input name="refundPoisha" type="number" min="0" defaultValue="0" />
        </label>
        <label>
          Release to worker (poisha)
          <input name="releasePoisha" type="number" min="0" defaultValue="0" />
        </label>
        <label>
          Final job status
          <select name="jobStatus">
            <option>COMPLETED</option>
            <option>CANCELLED_BY_CUSTOMER</option>
            <option>CANCELLED_BY_WORKER</option>
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary">Confirm resolution</button>
      </form>
    </Dialog>
  );
}

function Notifications() {
  const [result, setResult] = useState<{
    audienceCount: number;
    preview: { title: string; body: string };
  } | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [payload, setPayload] = useState({
    name: "Pilot update",
    title: "KAAJ update",
    body: "A marketplace update is available.",
    segment: { status: "ACTIVE" },
    throttlePerMinute: 100,
  });
  async function dryRun() {
    setError("");
    try {
      setResult(
        await adminApi("notifications/campaign/dry-run", json("POST", payload)),
      );
    } catch (caught) {
      setError((caught as Error).message);
    }
  }
  async function send() {
    setSending(true);
    try {
      await adminApi("notifications/campaign/send", json("POST", payload));
      setResult(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSending(false);
    }
  }
  return (
    <div className="campaign-layout">
      <section className="config-editor">
        <label>
          Campaign name
          <input
            value={payload.name}
            onChange={(event) =>
              setPayload({ ...payload, name: event.target.value })
            }
          />
        </label>
        <label>
          Title
          <input
            value={payload.title}
            onChange={(event) =>
              setPayload({ ...payload, title: event.target.value })
            }
          />
        </label>
        <label>
          Message
          <textarea
            value={payload.body}
            onChange={(event) =>
              setPayload({ ...payload, body: event.target.value })
            }
          />
        </label>
        <label>
          Audience
          <select
            onChange={(event) =>
              setPayload({
                ...payload,
                segment: {
                  status: "ACTIVE",
                  ...(event.target.value ? { role: event.target.value } : {}),
                },
              })
            }
          >
            <option value="">All active users</option>
            <option>WORKER</option>
            <option>CUSTOMER</option>
            <option>BUSINESS</option>
          </select>
        </label>
        <label>
          Throttle per minute
          <input
            type="number"
            min="1"
            max="1000"
            value={payload.throttlePerMinute}
            onChange={(event) =>
              setPayload({
                ...payload,
                throttlePerMinute: Number(event.target.value),
              })
            }
          />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button onClick={dryRun}>Run dry-run</button>
          {result && (
            <button
              className="primary small-button"
              disabled={sending}
              onClick={send}
            >
              Send campaign
            </button>
          )}
        </div>
      </section>
      <section className="phone-preview">
        <span>PREVIEW</span>
        <div>
          <strong>{result?.preview.title ?? payload.title}</strong>
          <p>{result?.preview.body ?? payload.body}</p>
        </div>
        {result && (
          <em>{result.audienceCount} recipients match this segment</em>
        )}
      </section>
    </div>
  );
}

function Analytics() {
  const { data, loading, error } =
    useData<Record<string, string | number>>("analytics");
  return (
    <State loading={loading} error={error}>
      <div className="metric-grid">
        {Object.entries(data ?? {})
          .filter(([, value]) => typeof value === "number")
          .map(([key, value]) => (
            <article key={key}>
              <span>{humanize(key)}</span>
              <strong>{value}</strong>
            </article>
          ))}
      </div>
      <p className="muted">{data?.note}</p>
    </State>
  );
}

function AuditTrail() {
  const { data, loading, error } = useData<{
    items: Array<{
      id: string;
      action: string;
      entity: string;
      entity_id: string | null;
      created_at: string;
      actor: { email: string } | null;
    }>;
  }>("audit-logs?limit=100");
  return (
    <State loading={loading} error={error}>
      <DataTable headers={["Action", "Entity", "Actor", "Time"]}>
        {(data?.items ?? []).map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{humanize(item.action)}</strong>
            </td>
            <td>
              {item.entity}
              <small>{item.entity_id}</small>
            </td>
            <td>{item.actor?.email ?? "System"}</td>
            <td>{formatDate(item.created_at)}</td>
          </tr>
        ))}
      </DataTable>
    </State>
  );
}

function ReasonDialog({
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
            setError((caught as Error).message);
            setBusy(false);
          }
        }}
      >
        {extra}
        <label>
          Required operational reason
          <textarea name="reason" minLength={8} required autoFocus />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? "Applying…" : confirmLabel}
        </button>
      </form>
    </Dialog>
  );
}

function Dialog({
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
        aria-label={title}
      >
        <div className="dialog-head">
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function Section({
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
          <h2>{title}</h2>
          <p>{note}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Summary({ count, label }: { count: number; label: string }) {
  return (
    <div className="summary">
      <strong>{count}</strong>
      <span>{label} in this operational view</span>
    </div>
  );
}
function DataTable({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Badge({ value }: { value: string }) {
  return (
    <span className={`badge badge-${value.toLowerCase()}`}>
      {humanize(value)}
    </span>
  );
}
function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/([a-z])([A-Z])/gu, "$1 $2")
    .toLowerCase()
    .replace(/^./u, (letter) => letter.toUpperCase());
}
function nextModerationLevel(value?: string | null) {
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
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
