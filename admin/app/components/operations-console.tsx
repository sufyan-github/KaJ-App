"use client";
import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { adminApi, json } from "@/lib/admin-api";
import {
  AdminLocale,
  friendlyAdminError,
  getActiveAdminLocale,
  localizedEntityName,
  setActiveAdminLocale,
  tr,
} from "@/lib/admin-i18n";
type Admin = {
  email: string;
  role: string;
  userId: string;
};
type ModuleKey =
  | "dashboard"
  | "users"
  | "reports"
  | "risk"
  | "jobs"
  | "applications"
  | "verification"
  | "categories"
  | "locations"
  | "config"
  | "flags"
  | "disputes"
  | "subscriptions"
  | "jobPayments"
  | "notifications"
  | "analytics"
  | "audit";
const modules: Array<[ModuleKey, string, string]> = [
  ["dashboard", "Dashboard", "Live marketplace health"],
  ["users", "Users", "Support and moderation"],
  ["reports", "Safety reports", "Human review and progressive action"],
  ["risk", "Risk review", "Deterministic signals, human decisions only"],
  ["jobs", "Jobs", "Lifecycle rescue"],
  ["applications", "Applications", "Unstick applications"],
  ["verification", "Verification", "Document review queue"],
  ["categories", "Categories", "D12 safety policies"],
  ["locations", "Locations", "Launch service areas"],
  ["config", "Configuration", "Preview and revert"],
  ["flags", "Feature flags", "Percentage rollouts"],
  ["disputes", "Disputes", "Evidence and resolution"],
  ["subscriptions", "Subscriptions", "Plans and operator access"],
  ["jobPayments", "Job payments", "Offline cash payment oversight"],
  ["notifications", "Notifications", "Campaign dry-runs"],
  ["analytics", "Analytics", "Marketplace health"],
  ["audit", "Audit trail", "Who changed what"],
];
export function OperationsConsole({
  admin,
  busy,
  logout,
  locale,
  onLocaleChange,
}: {
  admin: Admin;
  busy: boolean;
  logout: () => Promise<void>;
  locale: AdminLocale;
  onLocaleChange: (locale: AdminLocale) => void;
}) {
  setActiveAdminLocale(locale);
  const [active, setActive] = useState<ModuleKey>("dashboard");
  return (
    <main className="ops-shell">
      <aside>
        <div className="brand-row">
          <div className="brand-mark small">{tr("\u0995")}</div>
          <div>
            <strong>{tr("KAAJ")}</strong>
            <span>{tr("OPERATIONS")}</span>
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
              {tr(name)}
            </button>
          ))}
        </nav>
        <div className="account">
          <div className="avatar">{admin.email[0]?.toUpperCase()}</div>
          <div>
            <strong>{admin.email}</strong>
            <span>{humanize(admin.role)}</span>
          </div>
          <button onClick={logout} disabled={busy} aria-label={tr("Sign out")}>
            {tr("\u2197")}
          </button>
        </div>
      </aside>
      <section className="workspace">
        <header>
          <div>
            <p className="eyebrow">{tr("MVP OPERATIONS")}</p>
            <h1>{tr(modules.find(([key]) => key === active)?.[1] ?? "")}</h1>
            <p>{tr(modules.find(([key]) => key === active)?.[2] ?? "")}</p>
          </div>
          <div className="header-actions">
            <div className="locale-switch" aria-label={tr("Language")}>
              <button
                className={locale === "en" ? "active" : ""}
                onClick={() => onLocaleChange("en")}
              >
                EN
              </button>
              <button
                className={locale === "bn" ? "active" : ""}
                onClick={() => onLocaleChange("bn")}
              >
                বাংলা
              </button>
            </div>
            <div className="session-pill">
              <span />
              {tr("Secure session \u00B7 30 min")}
            </div>
          </div>
        </header>
        <div className="notice compact">
          <strong>{tr("Every view and action is audited.")}</strong>
          <span>
            {tr(
              "High-risk changes require a reason and explicit confirmation.",
            )}
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
  if (active === "risk") return <RiskReview />;
  if (active === "jobs") return <Jobs />;
  if (active === "applications") return <Applications />;
  if (active === "verification") return <Verification />;
  if (active === "categories") return <Categories />;
  if (active === "locations") return <Locations />;
  if (active === "config") return <Configuration />;
  if (active === "flags") return <Flags />;
  if (active === "disputes") return <Disputes />;
  if (active === "subscriptions") return <Subscriptions />;
  if (active === "jobPayments") return <JobPayments />;
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
      setError(friendlyAdminError(caught));
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
            <strong>{formatNumber(value)}</strong>
          </article>
        ))}
      </div>
      <Section
        title={tr("Stuck jobs")}
        note={tr("Non-terminal jobs unchanged for more than two hours")}
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

type SubscriptionPlanItem = {
  id: string;
  code: string;
  nameEn: string;
  nameBn: string;
  descriptionEn: string | null;
  descriptionBn: string | null;
  pricePoisha: string;
  currency: string;
  durationDays: number;
  featureKeys: string[];
  isActive: boolean;
  sortOrder: number;
};
type SubscriptionRuleItem = {
  featureKey: string;
  isActive: boolean;
  requiresActiveSubscription: boolean;
  description: string | null;
};
type SubscriptionItem = {
  id: string;
  status: string;
  startsAt: string | null;
  expiresAt: string | null;
  plan: SubscriptionPlanItem;
  payment: { status: string; method: string } | null;
  user: {
    displayName: string;
    maskedPhone: string;
    operator: {
      status: string;
      operator: { nameEn: string; nameBn: string; code: string } | null;
    } | null;
  };
};
function Subscriptions() {
  const overview = useData<{
    subscriptions: Record<string, number>;
    payments: Record<string, number>;
    operators: Record<string, number>;
    plans: SubscriptionPlanItem[];
    accessRules: SubscriptionRuleItem[];
  }>("subscriptions/overview");
  const subscribers = useData<{ items: SubscriptionItem[] }>(
    "subscriptions?limit=100",
  );
  const [createPlan, setCreatePlan] = useState(false);
  const [editPlan, setEditPlan] = useState<SubscriptionPlanItem | null>(null);
  const [subscriberAction, setSubscriberAction] = useState<{
    item: SubscriptionItem;
    status: "ACTIVE" | "CANCELLED";
  } | null>(null);
  const [ruleAction, setRuleAction] = useState<SubscriptionRuleItem | null>(
    null,
  );
  const loading = overview.loading || subscribers.loading;
  const error = overview.error || subscribers.error;
  const reload = async () => {
    await Promise.all([overview.reload(), subscribers.reload()]);
  };
  return (
    <State loading={loading} error={error}>
      <div className="metric-grid">
        <article>
          <span>{tr("Active subscriptions")}</span>
          <strong>
            {formatNumber(overview.data?.subscriptions.ACTIVE ?? 0)}
          </strong>
        </article>
        <article>
          <span>{tr("Pending requests")}</span>
          <strong>
            {formatNumber(overview.data?.subscriptions.PENDING ?? 0)}
          </strong>
        </article>
        <article>
          <span>{tr("Verified operators")}</span>
          <strong>
            {formatNumber(overview.data?.operators.VERIFIED ?? 0)}
          </strong>
        </article>
      </div>
      <div className="notice compact">
        <strong>{tr("No automatic operator charging")}</strong>
        <span>
          {tr(
            "Version 1 records requests only. Prefix detection is never treated as operator verification.",
          )}
        </span>
      </div>
      <Section
        title="Subscription plans"
        note="Create pricing only after the commercial plan is approved"
      >
        <div className="toolbar">
          <Summary
            count={overview.data?.plans.length ?? 0}
            label={tr("plans")}
          />
          <button
            className="primary small-button"
            onClick={() => setCreatePlan(true)}
          >
            {tr("Create plan")}
          </button>
        </div>
        <DataTable
          headers={["Plan", "Price", "Duration", "Access", "Status", "Action"]}
        >
          {(overview.data?.plans ?? []).map((plan) => (
            <tr key={plan.id}>
              <td>
                <strong>{localizedEntityName(plan.nameEn, plan.nameBn)}</strong>
                <small>{plan.code}</small>
              </td>
              <td>{formatPoisha(plan.pricePoisha)}</td>
              <td>
                {formatNumber(plan.durationDays)} {tr("days")}
              </td>
              <td>{plan.featureKeys.map(humanize).join(", ") || tr("None")}</td>
              <td>
                <Badge value={plan.isActive ? "ACTIVE" : "INACTIVE"} />
              </td>
              <td className="actions">
                <button onClick={() => setEditPlan(plan)}>
                  {tr("Edit plan")}
                </button>
              </td>
            </tr>
          ))}
        </DataTable>
      </Section>
      <Section
        title="Access rules"
        note="Rules apply only when subscriptions_enabled reaches full rollout"
      >
        <DataTable
          headers={[
            "Feature",
            "Subscription required",
            "Rule status",
            "Action",
          ]}
        >
          {(overview.data?.accessRules ?? []).map((rule) => (
            <tr key={rule.featureKey}>
              <td>
                <strong>{humanize(rule.featureKey)}</strong>
                <small>{tr(rule.description ?? "")}</small>
              </td>
              <td>{tr(rule.requiresActiveSubscription ? "Yes" : "No")}</td>
              <td>
                <Badge value={rule.isActive ? "ACTIVE" : "INACTIVE"} />
              </td>
              <td className="actions">
                <button onClick={() => setRuleAction(rule)}>
                  {tr(
                    rule.requiresActiveSubscription
                      ? "Make optional"
                      : "Require subscription",
                  )}
                </button>
              </td>
            </tr>
          ))}
        </DataTable>
      </Section>
      <Section
        title="Subscribers"
        note="Subscription payment records are separate from job payments"
      >
        <DataTable
          headers={[
            "Person",
            "Plan",
            "Operator",
            "Payment",
            "Status",
            "Actions",
          ]}
        >
          {(subscribers.data?.items ?? []).map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{tr(item.user.displayName)}</strong>
                <small>{item.user.maskedPhone}</small>
              </td>
              <td>{localizedEntityName(item.plan.nameEn, item.plan.nameBn)}</td>
              <td>
                {item.user.operator?.operator
                  ? localizedEntityName(
                      item.user.operator.operator.nameEn,
                      item.user.operator.operator.nameBn,
                    )
                  : tr("Unavailable")}
                <small>
                  {humanize(item.user.operator?.status ?? "UNSUPPORTED")}
                </small>
              </td>
              <td>
                <Badge value={item.payment?.status ?? "PENDING"} />
                <small>
                  {humanize(item.payment?.method ?? "OPERATOR_BILLING")}
                </small>
              </td>
              <td>
                <Badge value={item.status} />
                {item.expiresAt && <small>{formatDate(item.expiresAt)}</small>}
              </td>
              <td className="actions">
                {item.status === "PENDING" && (
                  <button
                    onClick={() =>
                      setSubscriberAction({ item, status: "ACTIVE" })
                    }
                  >
                    {tr("Confirm external payment and activate")}
                  </button>
                )}
                {(item.status === "ACTIVE" || item.status === "PENDING") && (
                  <button
                    onClick={() =>
                      setSubscriberAction({ item, status: "CANCELLED" })
                    }
                  >
                    {tr("Cancel")}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      </Section>
      {createPlan && (
        <PlanDialog
          rules={overview.data?.accessRules ?? []}
          onClose={() => setCreatePlan(false)}
          onDone={async () => {
            setCreatePlan(false);
            await reload();
          }}
        />
      )}
      {editPlan && (
        <PlanDialog
          plan={editPlan}
          rules={overview.data?.accessRules ?? []}
          onClose={() => setEditPlan(null)}
          onDone={async () => {
            setEditPlan(null);
            await reload();
          }}
        />
      )}
      {subscriberAction && (
        <ReasonDialog
          title={
            subscriberAction.status === "ACTIVE"
              ? "Confirm payment, verify operator and activate subscription"
              : "Cancel subscription"
          }
          confirmLabel={
            subscriberAction.status === "ACTIVE"
              ? "Confirm external payment and activate"
              : "Confirm cancellation"
          }
          extra={
            subscriberAction.status === "ACTIVE" ? (
              <p className="muted">
                {tr(
                  "Use this only after payment and operator eligibility were verified outside KAAJ. This is a manual record, not an online charge.",
                )}
              </p>
            ) : undefined
          }
          onClose={() => setSubscriberAction(null)}
          onConfirm={async (reason) => {
            await adminApi(
              `subscriptions/${subscriberAction.item.id}/status`,
              json("PUT", {
                status: subscriberAction.status,
                reason,
                operatorVerified: subscriberAction.status === "ACTIVE",
                paymentStatus:
                  subscriberAction.status === "ACTIVE" ? "PAID" : "CANCELLED",
              }),
            );
            setSubscriberAction(null);
            await reload();
          }}
        />
      )}
      {ruleAction && (
        <ReasonDialog
          title={`Update access rule: ${humanize(ruleAction.featureKey)}`}
          confirmLabel="Update access rule"
          onClose={() => setRuleAction(null)}
          onConfirm={async (reason) => {
            await adminApi(
              `subscriptions/access-rules/${ruleAction.featureKey}`,
              json("PUT", {
                requiresActiveSubscription:
                  !ruleAction.requiresActiveSubscription,
                isActive: ruleAction.isActive,
                description: ruleAction.description,
                reason,
              }),
            );
            setRuleAction(null);
            await reload();
          }}
        />
      )}
    </State>
  );
}

function PlanDialog({
  plan,
  rules,
  onClose,
  onDone,
}: {
  plan?: SubscriptionPlanItem;
  rules: SubscriptionRuleItem[];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const editing = plan !== undefined;
  return (
    <Dialog
      title={editing ? "Edit subscription plan" : "Create subscription plan"}
      onClose={onClose}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          const form = new FormData(event.currentTarget);
          try {
            const payload: Record<string, unknown> = {
              nameEn: String(form.get("nameEn")).trim(),
              nameBn: String(form.get("nameBn")).trim(),
              descriptionEn: String(form.get("descriptionEn")).trim(),
              descriptionBn: String(form.get("descriptionBn")).trim(),
              pricePoisha: String(
                Math.round(Number(form.get("priceTaka")) * 100),
              ),
              durationDays: Number(form.get("durationDays")),
              featureKeys: form.getAll("featureKeys").map(String),
              isActive: form.get("isActive") === "on",
              sortOrder: plan?.sortOrder ?? 0,
              reason: String(form.get("reason")),
            };
            if (!editing) {
              payload.code = String(form.get("code")).trim().toUpperCase();
            }
            await adminApi(
              editing
                ? `subscriptions/plans/${plan.id}`
                : "subscriptions/plans",
              json(editing ? "PUT" : "POST", payload),
            );
            await onDone();
          } catch (caught) {
            setError(friendlyAdminError(caught));
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <label>
            {tr("Plan code")}
            <input
              name="code"
              pattern="[A-Za-z0-9_]+"
              defaultValue={plan?.code}
              disabled={editing}
              required={!editing}
            />
          </label>
          <label>
            {tr("Duration in days")}
            <input
              name="durationDays"
              type="number"
              min="1"
              max="366"
              defaultValue={plan?.durationDays}
              required
            />
          </label>
          <label>
            {tr("English name")}
            <input
              name="nameEn"
              minLength={2}
              defaultValue={plan?.nameEn}
              required
            />
          </label>
          <label>
            {tr("Bangla name")}
            <input
              name="nameBn"
              minLength={2}
              defaultValue={plan?.nameBn}
              required
            />
          </label>
          <label>
            {tr("Price in BDT")}
            <input
              name="priceTaka"
              type="number"
              min="0"
              step="0.01"
              defaultValue={plan ? Number(plan.pricePoisha) / 100 : undefined}
              required
            />
          </label>
        </div>
        <label>
          {tr("English description")}
          <textarea
            name="descriptionEn"
            defaultValue={plan?.descriptionEn ?? ""}
          />
        </label>
        <label>
          {tr("Bangla description")}
          <textarea
            name="descriptionBn"
            defaultValue={plan?.descriptionBn ?? ""}
          />
        </label>
        <fieldset>
          <legend>{tr("Included marketplace access")}</legend>
          <div className="check-grid">
            {rules.map((rule) => (
              <label key={rule.featureKey}>
                <input
                  type="checkbox"
                  name="featureKeys"
                  value={rule.featureKey}
                  defaultChecked={plan?.featureKeys.includes(rule.featureKey)}
                />
                {humanize(rule.featureKey)}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="inline-check">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={plan?.isActive}
          />
          {tr("Make plan visible immediately")}
        </label>
        <label>
          {tr("Required operational reason")}
          <textarea name="reason" minLength={8} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>
          {tr(
            busy
              ? editing
                ? "Updating…"
                : "Creating…"
              : editing
                ? "Save plan"
                : "Create plan",
          )}
        </button>
      </form>
    </Dialog>
  );
}

function JobPayments() {
  const { data, loading, error } = useData<{
    capabilities: Record<string, boolean>;
    counts: Record<string, number>;
    items: Array<{
      id: string;
      assignmentId: string;
      jobTitle: string;
      payerMaskedPhone: string;
      agreedPoisha: string;
      method: string;
      status: string;
      cashRecordedAt: string | null;
      disputedAt: string | null;
      createdAt: string;
    }>;
  }>("job-payments/overview");
  return (
    <State loading={loading} error={error}>
      <div className="metric-grid">
        <article>
          <span>{tr("Pending cash payments")}</span>
          <strong>{formatNumber(data?.counts.PENDING ?? 0)}</strong>
        </article>
        <article>
          <span>{tr("Cash payments recorded")}</span>
          <strong>{formatNumber(data?.counts.CASH_RECORDED ?? 0)}</strong>
        </article>
        <article>
          <span>{tr("Disputed payments")}</span>
          <strong>{formatNumber(data?.counts.DISPUTED ?? 0)}</strong>
        </article>
      </div>
      <div className="notice compact">
        <strong>{tr("Cash on completion only")}</strong>
        <span>
          {tr(
            "Online payments, mobile banking, wallets and withdrawals are coming soon and are not connected.",
          )}
        </span>
      </div>
      <Section
        title="Job payment records"
        note="Job payments are kept separate from subscription payments"
      >
        <DataTable
          headers={["Job", "Payer", "Amount", "Method", "Status", "Updated"]}
        >
          {(data?.items ?? []).map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{item.jobTitle}</strong>
                <small>{item.assignmentId}</small>
              </td>
              <td>{item.payerMaskedPhone}</td>
              <td>{formatPoisha(item.agreedPoisha)}</td>
              <td>{humanize(item.method)}</td>
              <td>
                <Badge value={item.status} />
              </td>
              <td>
                {formatDate(
                  item.cashRecordedAt ?? item.disputedAt ?? item.createdAt,
                )}
              </td>
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
      <Summary count={data?.total ?? 0} label={tr("users")} />
      <DataTable
        headers={["Person", "Roles", "Trust", "Moderation", "Actions"]}
      >
        {(data?.items ?? []).map((user) => (
          <tr key={user.id}>
            <td>
              <strong>{user.name}</strong>
              <small>{user.phone ?? user.email ?? user.id}</small>
            </td>
            <td>{user.roles.map(humanize).join(", ")}</td>
            <td>
              <Badge value={user.trustLevel} />
            </td>
            <td>
              <Badge value={user.status} />
              <small>{humanize(user.moderationLevel ?? "NONE")}</small>
              {user.reverificationRequired && (
                <small>{tr("Identity re-verification required")}</small>
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
                {tr("Next:")}{" "}
                {humanize(nextModerationLevel(user.moderationLevel) ?? "final")}
              </button>
              <button
                onClick={() => setAction({ user, kind: "restore" })}
                disabled={
                  (user.moderationLevel ?? "NONE") === "NONE" ||
                  user.reverificationRequired
                }
              >
                {tr("Restore")}
              </button>
              <button onClick={() => setAction({ user, kind: "reset" })}>
                {tr("Reset sessions")}
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
      <Summary count={data?.total ?? 0} label={tr("safety reports")} />
      <DataTable
        headers={["Report", "People", "Status", "Evidence", "Actions"]}
      >
        {(data?.items ?? []).map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{humanize(item.reasonCode)}</strong>
              <small>
                {humanize(item.targetType)} {tr("\u00B7")}{" "}
                {formatDate(item.createdAt)}
              </small>
            </td>
            <td>
              <strong>{item.subject?.name ?? tr("No user subject")}</strong>
              <small>
                {tr("Reported by")} {item.reporter.name}
              </small>
              {item.subject && (
                <small>
                  {tr("Current level:")}{" "}
                  {humanize(item.subject.moderationLevel)}
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
                  {tr("Start review")}
                </button>
              )}
              {(item.status === "OPEN" || item.status === "UNDER_REVIEW") && (
                <button onClick={() => setSelected(item)}>
                  {tr("Decide")}
                </button>
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
  reporter: {
    id: string;
    name: string;
  };
  subject: {
    id: string;
    name: string;
    status: string;
    moderationLevel: string;
    reverificationRequired: boolean;
  } | null;
};
function RiskReview() {
  const { data, loading, error, reload } = useData<{
    items: RiskItem[];
    total: number;
    metrics: {
      adjudicatedCount: number;
      observedFalsePositiveRateBps: number | null;
      observedPrecisionBps: number | null;
    };
  }>("risk/items?limit=100");
  const [scan, setScan] = useState(false);
  const [selected, setSelected] = useState<RiskItem | null>(null);
  const metrics = data?.metrics;
  return (
    <State loading={loading} error={error}>
      <div className="metric-grid">
        <article>
          <span>{tr("Queue items")}</span>
          <strong>{formatNumber(data?.total ?? 0)}</strong>
        </article>
        <article>
          <span>{tr("Adjudicated")}</span>
          <strong>{formatNumber(metrics?.adjudicatedCount ?? 0)}</strong>
        </article>
        <article>
          <span>{tr("Observed precision")}</span>
          <strong>{formatBasisPoints(metrics?.observedPrecisionBps)}</strong>
        </article>
        <article>
          <span>{tr("Observed false positives")}</span>
          <strong>
            {formatBasisPoints(metrics?.observedFalsePositiveRateBps)}
          </strong>
        </article>
      </div>
      <div className="notice compact">
        <strong>{tr("Signals never change an account automatically.")}</strong>
        <span>
          {tr(
            "Escalation sends the case to a separate human moderation decision.",
          )}
        </span>
        <button onClick={() => setScan(true)}>{tr("Run reviewed scan")}</button>
      </div>
      <DataTable headers={["Account", "Risk", "Signals", "Status", "Actions"]}>
        {(data?.items ?? []).map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{item.subject.name}</strong>
              <small>{item.subject.id}</small>
              <small>
                {tr("Account:")} {humanize(item.subject.moderationLevel)}{" "}
                {tr("\u00B7")} {humanize(item.subject.status)}
              </small>
            </td>
            <td>
              <strong>
                {item.score}
                {tr("/100")}
              </strong>
              <small>{humanize(item.severity)}</small>
            </td>
            <td>
              {item.signals.map((signal, index) => (
                <small key={`${item.id}-${signal.type}-${index}`}>
                  {humanize(signal.type)}
                  {tr("(+")}
                  {signal.score}
                  {tr(")")}
                </small>
              ))}
            </td>
            <td>
              <Badge value={item.status} />
              <small>
                {tr("Last signal")} {formatDate(item.lastDetectedAt)}
              </small>
            </td>
            <td className="actions">
              {item.status === "OPEN" && (
                <button
                  onClick={async () => {
                    await adminApi(
                      `risk/items/${item.id}/review`,
                      json("POST", {}),
                    );
                    await reload();
                  }}
                >
                  {tr("Start review")}
                </button>
              )}
              {(item.status === "OPEN" || item.status === "UNDER_REVIEW") && (
                <button onClick={() => setSelected(item)}>
                  {tr("Decide")}
                </button>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
      {scan && (
        <ReasonDialog
          title={tr("Run deterministic risk scan")}
          confirmLabel={tr("Run scan")}
          onClose={() => setScan(false)}
          onConfirm={async (reason) => {
            await adminApi("risk/scan", json("POST", { reason }));
            setScan(false);
            await reload();
          }}
        />
      )}
      {selected && (
        <RiskDecisionDialog
          item={selected}
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
type RiskItem = {
  id: string;
  score: number;
  severity: string;
  signals: Array<{
    type: string;
    score: number;
    evidence: unknown;
  }>;
  status: string;
  lastDetectedAt: string;
  subject: {
    id: string;
    name: string;
    status: string;
    moderationLevel: string;
  };
};
function RiskDecisionDialog({
  item,
  onClose,
  onDone,
}: {
  item: RiskItem;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [status, setStatus] = useState("ESCALATED");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  return (
    <Dialog
      title={`Decide risk item for ${item.subject.name}`}
      onClose={onClose}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            await adminApi(
              `risk/items/${item.id}/decision`,
              json("POST", { status, reason }),
            );
            await onDone();
          } catch (caught) {
            setError(friendlyAdminError(caught));
          }
        }}
      >
        <label>
          {tr("Human decision")}
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="ESCALATED">
              {tr("Escalate for moderation review")}
            </option>
            <option value="CLEARED">{tr("Clear as unsupported")}</option>
          </select>
        </label>
        <p>
          {tr(
            "This decision records the risk outcome only. It will not warn, restrict, suspend, or ban the account.",
          )}
        </p>
        <label>
          {tr("Required decision reason")}
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
            {tr("Cancel")}
          </button>
          <button type="submit">{tr("Confirm risk decision")}</button>
        </div>
      </form>
    </Dialog>
  );
}
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
    <Dialog title={tr("Resolve safety report")} onClose={onClose}>
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
            setError(friendlyAdminError(caught));
          }
        }}
      >
        <label>
          {tr("Decision")}
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="ACTIONED">{tr("Action supported")}</option>
            <option value="DISMISSED">{tr("Dismiss report")}</option>
          </select>
        </label>
        {status === "ACTIONED" && (
          <>
            <label>
              {tr("Next moderation step")}
              <select
                value={action ?? ""}
                onChange={(event) => setAction(event.target.value)}
              >
                {action && <option value={action}>{humanize(action)}</option>}
              </select>
            </label>
            {(action === "RESTRICT" || action === "SUSPEND") && (
              <label>
                {tr("Duration in days")}
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
                {tr("Require identity re-verification")}
              </label>
            )}
          </>
        )}
        <label>
          {tr("Required decision reason")}
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
            {tr("Cancel")}
          </button>
          <button type="submit" disabled={status === "ACTIONED" && !action}>
            {tr("Confirm decision")}
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
      <Summary count={data?.total ?? 0} label={tr("jobs")} />
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
              {job.applicationsCount} {tr("applications")} {tr("\u00B7")}{" "}
              {job.assignmentsCount} {tr("assignments")}
            </td>
            <td className="actions">
              <button
                onClick={() => {
                  setTarget("SUSPENDED");
                  setSelected(job);
                }}
              >
                {tr("Force transition")}
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
                {tr(job.isFeatured ? "Unfeature" : "Feature")}
              </button>
            </td>
          </tr>
        ))}
      </DataTable>
      {selected && (
        <ReasonDialog
          title={`Force transition: ${selected.title}`}
          confirmLabel={tr("Apply forced transition")}
          extra={
            <label>
              {tr("Target status")}
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
  poster: {
    name: string;
  };
  applicationsCount: number;
  assignmentsCount: number;
};
function Applications() {
  const { data, loading, error, reload } = useData<{
    items: Array<{
      id: string;
      status: string;
      job: {
        title: string;
      };
      worker: {
        name: string;
      };
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
                {tr("Unstick")}
              </button>
            </td>
          </tr>
        ))}
      </DataTable>
      {selected && (
        <ReasonDialog
          title={tr("Return application to pending")}
          confirmLabel={tr("Unstick application")}
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
            <td>{humanize(item.kind)}</td>
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
                  {tr("View")} {humanize(document.kind)}
                </button>
              ))}
              {!item.documents.length && tr("None")}
            </td>
            <td>
              <Badge value={item.status} />
            </td>
            <td className="actions">
              <button onClick={() => setDecision({ item, status: "APPROVED" })}>
                {tr("Approve")}
              </button>
              <button onClick={() => setDecision({ item, status: "REJECTED" })}>
                {tr("Reject")}
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
          title={tr("Sensitive verification document")}
          onClose={() => setDocumentView(null)}
        >
          <div className="document-viewer">
            {documentView.mime.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={documentView.downloadUrl}
                alt={tr("Verification evidence")}
              />
            ) : (
              <iframe
                src={documentView.downloadUrl}
                title={tr("Verification evidence")}
              />
            )}
            <span>{documentView.watermark}</span>
          </div>
          <p className="muted">
            {tr("This view is time-limited and recorded in the audit trail.")}
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
  user: {
    name: string;
    trustLevel: string;
  };
  documents: Array<{
    id: string;
    kind: string;
    mime: string;
  }>;
};
function Categories() {
  const { data, loading, error, reload } = useData<{
    items: CategoryItem[];
  }>("categories");
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
              <strong>
                {getActiveAdminLocale() === "bn" ? item.nameBn : item.nameEn}
              </strong>
              <small>
                {getActiveAdminLocale() === "bn" ? item.nameEn : item.nameBn}{" "}
                {tr("\u00B7")} {item.slug}
              </small>
            </td>
            <td>
              {item.minAge}
              {tr("+")}
            </td>
            <td className="toggle-list">
              <button
                className={item.requiresManualApproval ? "on" : ""}
                onClick={() => toggle(item, "requiresManualApproval")}
              >
                {tr("Manual approval")}
              </button>
              <button
                className={item.requiresIdentity ? "on" : ""}
                onClick={() => toggle(item, "requiresIdentity")}
              >
                {tr("Identity")}
              </button>
              <button
                className={item.requiresCertificate ? "on" : ""}
                onClick={() => toggle(item, "requiresCertificate")}
              >
                {tr("Certificate")}
              </button>
              <button
                className={item.unsafeForStudents ? "on danger" : ""}
                onClick={() => toggle(item, "unsafeForStudents")}
              >
                {tr("Student restriction")}
              </button>
            </td>
            <td>
              <button
                className={`switch ${item.isActive ? "on" : ""}`}
                aria-label={`${tr("Toggle")} ${localizedEntityName(item.nameEn, item.nameBn)}`}
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
  const { data, loading, error, reload } = useData<{
    items: LocationItem[];
  }>("locations");
  const [adding, setAdding] = useState(false);
  return (
    <State loading={loading} error={error}>
      <div className="toolbar">
        <Summary count={data?.items.length ?? 0} label={tr("locations")} />
        <button
          className="primary small-button"
          onClick={() => setAdding(true)}
        >
          {tr("Add location")}
        </button>
      </div>
      <DataTable headers={["Location", "Type", "Coordinates", "Active"]}>
        {(data?.items ?? []).map((item) => (
          <tr key={item.id}>
            <td>
              <strong>
                {getActiveAdminLocale() === "bn" ? item.nameBn : item.nameEn}
              </strong>
              <small>
                {getActiveAdminLocale() === "bn" ? item.nameEn : item.nameBn}
              </small>
            </td>
            <td>
              <Badge value={item.type} />
            </td>
            <td>
              {item.lat ?? "—"}
              {tr(",")} {item.lng ?? "—"}
            </td>
            <td>
              <button
                className={`switch ${item.isActive ? "on" : ""}`}
                aria-label={`${tr("Toggle")} ${localizedEntityName(item.nameEn, item.nameBn)}`}
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
    <Dialog title={tr("Add service location")} onClose={onClose}>
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
            setError(friendlyAdminError(caught));
          }
        }}
      >
        <label>
          {tr("Type")}
          <select
            name="type"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="CITY">{humanize("CITY")}</option>
            <option value="THANA">{humanize("THANA")}</option>
            <option value="AREA">{humanize("AREA")}</option>
          </select>
        </label>
        {type !== "CITY" && (
          <label>
            {tr("Parent location")}
            <select name="parentId" required>
              <option value="">{tr("Select a parent")}</option>
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
          {tr("English name")}
          <input name="nameEn" required />
        </label>
        <label>
          {tr("Bangla name")}
          <input name="nameBn" required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary">{tr("Create location")}</button>
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
  const [preview, setPreview] = useState<{
    changedFields: string[];
  } | null>(null);
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
            {tr("Configuration key")}
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
            {tr("JSON value")}
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={13}
              spellCheck={false}
            />
          </label>
          <div className="actions">
            <button onClick={previewChange}>{tr("Preview diff")}</button>
            {preview && (
              <button className="primary small-button" onClick={save}>
                {tr("Confirm change")}
              </button>
            )}
          </div>
          {preview && (
            <div className="diff-box">
              <strong>{tr("Changed fields")}</strong>
              <span>
                {preview.changedFields.join(", ") || tr("No changes")}
              </span>
            </div>
          )}
          {message && <p className="success">{message}</p>}
        </section>
        <Section
          title={tr("Revision history")}
          note={tr("Every version can be reverted")}
        >
          {(data?.revisions ?? []).map((revision) => (
            <div className="revision" key={revision.id}>
              <div>
                <strong>{revision.key}</strong>
                <small>
                  {revision.reason} {tr("\u00B7")}{" "}
                  {formatDate(revision.created_at)}
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
                {tr("Revert")}
              </button>
            </div>
          ))}
        </Section>
      </div>
    </State>
  );
}
type ConfigItem = {
  key: string;
  value: unknown;
  updatedAt: string;
};
function Flags() {
  const { data, loading, error, reload } = useData<{
    items: Array<{
      key: string;
      isEnabled: boolean;
      rolloutPercent: number;
    }>;
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
  item: {
    key: string;
    isEnabled: boolean;
    rolloutPercent: number;
  };
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
        {tr("%")}
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
          {tr("Save")}
        </button>
      </td>
    </tr>
  );
}
function Disputes() {
  const { data, loading, error, reload } = useData<{
    items: DisputeItem[];
  }>("disputes?limit=100");
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
              {item.sla?.resolutionOverdue && (
                <small>{tr("Resolution overdue")}</small>
              )}
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
                  {tr("Start review")}
                </button>
              )}
              <button
                className="table-button"
                onClick={() => setSelected(item)}
              >
                {tr("Resolve")}
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
  sla?: {
    resolutionOverdue: boolean;
  };
  job: {
    title: string;
  };
  payment?: {
    amountPoisha: string;
  } | null;
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
            setError(friendlyAdminError(caught));
          }
        }}
      >
        <label>
          {tr("Resolution")}
          <textarea name="resolution" minLength={8} required />
        </label>
        <label>
          {tr("Decision reason")}
          <textarea name="reason" minLength={8} required />
        </label>
        <label>
          {tr("Decision")}
          <select name="decision" defaultValue="RELEASE_FULL">
            <option value="RELEASE_FULL">{humanize("RELEASE_FULL")}</option>
            <option value="RELEASE_PARTIAL">
              {humanize("RELEASE_PARTIAL")}
            </option>
            <option value="REFUND_FULL">{humanize("REFUND_FULL")}</option>
            <option value="REFUND_PARTIAL">{humanize("REFUND_PARTIAL")}</option>
            <option value="SPLIT">{humanize("SPLIT")}</option>
          </select>
        </label>
        {item.payment?.amountPoisha && (
          <p>
            {tr("Amount to allocate:")} {item.payment.amountPoisha}{" "}
            {tr("poisha")}
          </p>
        )}
        <label>
          {tr("Cash refund to record (poisha)")}
          <input name="refundPoisha" type="number" min="0" defaultValue="0" />
        </label>
        <label>
          {tr("Release to worker (poisha)")}
          <input name="releasePoisha" type="number" min="0" defaultValue="0" />
        </label>
        <label>
          {tr("Final job status")}
          <select name="jobStatus">
            <option value="COMPLETED">{humanize("COMPLETED")}</option>
            <option value="CANCELLED_BY_CUSTOMER">
              {humanize("CANCELLED_BY_CUSTOMER")}
            </option>
            <option value="CANCELLED_BY_WORKER">
              {humanize("CANCELLED_BY_WORKER")}
            </option>
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary">{tr("Confirm resolution")}</button>
      </form>
    </Dialog>
  );
}
function Notifications() {
  const [result, setResult] = useState<{
    audienceCount: number;
    preview: {
      title: string;
      body: string;
    };
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
      setError(friendlyAdminError(caught));
    }
  }
  async function send() {
    setSending(true);
    try {
      await adminApi("notifications/campaign/send", json("POST", payload));
      setResult(null);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setSending(false);
    }
  }
  return (
    <div className="campaign-layout">
      <section className="config-editor">
        <label>
          {tr("Campaign name")}
          <input
            value={payload.name}
            onChange={(event) =>
              setPayload({ ...payload, name: event.target.value })
            }
          />
        </label>
        <label>
          {tr("Title")}
          <input
            value={payload.title}
            onChange={(event) =>
              setPayload({ ...payload, title: event.target.value })
            }
          />
        </label>
        <label>
          {tr("Message")}
          <textarea
            value={payload.body}
            onChange={(event) =>
              setPayload({ ...payload, body: event.target.value })
            }
          />
        </label>
        <label>
          {tr("Audience")}
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
            <option value="">{tr("All active users")}</option>
            <option value="WORKER">{humanize("WORKER")}</option>
            <option value="CUSTOMER">{humanize("CUSTOMER")}</option>
            <option value="BUSINESS">{humanize("BUSINESS")}</option>
          </select>
        </label>
        <label>
          {tr("Throttle per minute")}
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
          <button onClick={dryRun}>{tr("Run dry-run")}</button>
          {result && (
            <button
              className="primary small-button"
              disabled={sending}
              onClick={send}
            >
              {tr("Send campaign")}
            </button>
          )}
        </div>
      </section>
      <section className="phone-preview">
        <span>{tr("PREVIEW")}</span>
        <div>
          <strong>{result?.preview.title ?? payload.title}</strong>
          <p>{result?.preview.body ?? payload.body}</p>
        </div>
        {result && (
          <em>{tr(`${result.audienceCount} recipients match this segment`)}</em>
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
              <strong>{formatNumber(Number(value))}</strong>
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
      actor: {
        email: string;
      } | null;
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
            <td>{item.actor?.email ?? tr("System")}</td>
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
          <h2>{tr(title)}</h2>
          <p>{tr(note)}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
function Summary({ count, label }: { count: number; label: string }) {
  return (
    <div className="summary">
      <strong>{formatNumber(count)}</strong>
      <span>
        {tr(label)} {tr("in this operational view")}
      </span>
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
              <th key={header}>{tr(header)}</th>
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
  return tr(
    value
      .replaceAll("_", " ")
      .replace(/([a-z])([A-Z])/gu, "$1 $2")
      .toLowerCase()
      .replace(/^./u, (letter) => letter.toUpperCase()),
  );
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
  return new Intl.DateTimeFormat(
    getActiveAdminLocale() === "bn" ? "bn-BD" : "en-BD",
    {
      dateStyle: "medium",
      timeStyle: "short",
      hour12: getActiveAdminLocale() !== "bn",
    },
  ).format(new Date(value));
}
function formatPoisha(value: string) {
  return new Intl.NumberFormat(
    getActiveAdminLocale() === "bn" ? "bn-BD" : "en-BD",
    { style: "currency", currency: "BDT" },
  ).format(Number(value) / 100);
}
function formatNumber(value: number) {
  return new Intl.NumberFormat(
    getActiveAdminLocale() === "bn" ? "bn-BD" : "en-BD",
  ).format(value);
}
function formatBasisPoints(value?: number | null) {
  return value == null
    ? tr("Not enough decisions")
    : `${(value / 100).toFixed(1)}%`;
}
