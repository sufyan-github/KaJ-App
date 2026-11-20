"use client";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { adminApi, json } from "@/lib/admin-api";
import {
  AdminLocale,
  friendlyAdminError,
  getActiveAdminLocale,
  localizedEntityName,
  setActiveAdminLocale,
  tr,
} from "@/lib/admin-i18n";
import {
  useData,
  State,
  ReasonDialog,
  Dialog,
  Section,
  Summary,
  DataTable,
  Badge,
  humanize,
  nextModerationLevel,
  formatMinutes,
  formatDate,
  formatPoisha,
  formatNumber,
  formatBasisPoints,
  Can,
  RoleProvider,
  useCan,
  FilterSelect,
  ListToolbar,
  usePagedView,
} from "./ui";
import { Staff } from "./views/staff";
import { AuditTrail } from "./views/audit";
import { AiUsage } from "./ai-usage";
import {
  Attendance,
  Businesses,
  Ideas,
  Introductions,
  Mentors,
  Skills,
} from "./views/directory";
import {
  type ConsoleModule,
  type ModuleKey,
  visibleModules,
  visibleTabs,
} from "@/lib/permissions";
type Admin = {
  email: string;
  role: string;
  userId: string;
};
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
  const modules = visibleModules(admin.role);
  const [selected, setActive] = useState<ModuleKey>("dashboard");
  // A role that cannot open the selected module lands on its first one.
  const current =
    modules.find((module) => module.key === selected) ?? modules[0];
  const active = current?.key;
  return (
    <RoleProvider value={admin.role}>
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
            {modules.map(({ key, name }, index) => (
              <button
                className={active === key ? "active" : ""}
                aria-current={active === key ? "page" : undefined}
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
            <button
              onClick={logout}
              disabled={busy}
              aria-label={tr("Sign out")}
            >
              {tr("\u2197")}
            </button>
          </div>
        </aside>
        <section className="workspace">
          <header>
            <div>
              <p className="eyebrow">{tr("MVP OPERATIONS")}</p>
              <h1>{tr(current?.name ?? "")}</h1>
              <p>{tr(current?.note ?? "")}</p>
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
          {current ? (
            <ModuleView
              active={current.key}
              module={current}
              role={admin.role}
              selfId={admin.userId}
            />
          ) : (
            <div className="panel-state" role="alert">
              {tr("Your role has no console views. Ask an administrator.")}
            </div>
          )}
        </section>
      </main>
    </RoleProvider>
  );
}
function ModuleView({
  active,
  module,
  role,
  selfId,
}: {
  active: ModuleKey;
  module: ConsoleModule;
  role: string;
  selfId: string;
}) {
  if (active === "staff") return <Staff selfId={selfId} />;
  if (active === "aiUsage") return <AiUsage />;
  if (active === "skills") return <Skills />;
  if (active === "attendance") return <Attendance />;
  if (active === "ideas")
    return (
      <TabbedModule
        module={module}
        role={role}
        views={{
          ideas: () => <Ideas />,
          introductions: () => <Introductions />,
        }}
      />
    );
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
  if (active === "learn")
    return (
      <TabbedModule
        module={module}
        role={role}
        views={{
          mentors: () => <MentorApplications />,
          opportunities: () => <LearningOpportunities />,
          courses: () => <Courses />,
          certificates: () => <CompletionRecords />,
          mentorList: () => <Mentors />,
        }}
      />
    );
  if (active === "business")
    return (
      <TabbedModule
        module={module}
        role={role}
        intro="Reported businesses, offerings, ideas and collaboration requests are handled in Safety reports."
        views={{
          verification: () => <Verification kind="BUSINESS" />,
          directory: () => <Businesses />,
          sectors: () => <Sectors />,
        }}
      />
    );
  if (active === "community")
    return (
      <TabbedModule
        module={module}
        role={role}
        intro="Reports on groups, sessions and introductions are decided in Safety reports; hiding here is for content found another way."
        views={{
          groups: () => <CommunityGroups />,
          sessions: () => <CommunitySessions />,
          ambassadors: () => <Ambassadors />,
        }}
      />
    );
  return <AuditTrail />;
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
  const [subscriberStatus, setSubscriberStatus] = useState("");
  const overview = useData<{
    subscriptions: Record<string, number>;
    payments: Record<string, number>;
    operators: Record<string, number>;
    plans: SubscriptionPlanItem[];
    accessRules: SubscriptionRuleItem[];
  }>("subscriptions/overview");
  const subscribers = usePagedView<SubscriptionItem>("subscriptions", {
    status: subscriberStatus,
  });
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
          <Can route="POST subscriptions/plans">
            <button
              className="primary small-button"
              onClick={() => setCreatePlan(true)}
            >
              {tr("Create plan")}
            </button>
          </Can>
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
                <Can route="PUT subscriptions/plans/:id">
                  <button onClick={() => setEditPlan(plan)}>
                    {tr("Edit plan")}
                  </button>
                </Can>
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
                <Can route="PUT subscriptions/access-rules/:featureKey">
                  <button onClick={() => setRuleAction(rule)}>
                    {tr(
                      rule.requiresActiveSubscription
                        ? "Make optional"
                        : "Require subscription",
                    )}
                  </button>
                </Can>
              </td>
            </tr>
          ))}
        </DataTable>
      </Section>
      <Section
        title="Subscribers"
        note="Subscription payment records are separate from job payments"
      >
        <ListToolbar>
          <FilterSelect
            label="Status"
            value={subscriberStatus}
            onChange={setSubscriberStatus}
            options={[
              ["", "All"],
              ["PENDING", "Pending"],
              ["ACTIVE", "Active"],
              ["EXPIRED", "Expired"],
              ["CANCELLED", "Cancelled"],
              ["INACTIVE", "Inactive"],
            ]}
          />
        </ListToolbar>
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
                  <Can route="PUT subscriptions/:id/status">
                    <button
                      onClick={() =>
                        setSubscriberAction({ item, status: "ACTIVE" })
                      }
                    >
                      {tr("Confirm external payment and activate")}
                    </button>
                  </Can>
                )}
                {(item.status === "ACTIVE" || item.status === "PENDING") && (
                  <Can route="PUT subscriptions/:id/status">
                    <button
                      onClick={() =>
                        setSubscriberAction({ item, status: "CANCELLED" })
                      }
                    >
                      {tr("Cancel")}
                    </button>
                  </Can>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
        {subscribers.more}
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
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const { data, loading, error, reload, more } = usePagedView<UserItem>(
    "users",
    {
      search,
      status,
    },
  );
  const [action, setAction] = useState<{
    user: UserItem;
    level?: string;
    kind: "moderate" | "restore" | "reset";
  } | null>(null);
  return (
    <State loading={loading} error={error}>
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search name, phone or email"
      >
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            ["", "All"],
            ["ACTIVE", "Active"],
            ["SUSPENDED", "Suspended"],
            ["BANNED", "Banned"],
            ["PENDING_DELETION", "Pending deletion"],
          ]}
        />
      </ListToolbar>
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
              <Can route="POST users/:id/moderation">
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
                  {humanize(
                    nextModerationLevel(user.moderationLevel) ?? "final",
                  )}
                </button>
              </Can>
              <Can route="POST users/:id/moderation/restore">
                <button
                  onClick={() => setAction({ user, kind: "restore" })}
                  disabled={
                    (user.moderationLevel ?? "NONE") === "NONE" ||
                    user.reverificationRequired
                  }
                >
                  {tr("Restore")}
                </button>
              </Can>
              <Can route="POST users/:id/reset-sessions">
                <button onClick={() => setAction({ user, kind: "reset" })}>
                  {tr("Reset sessions")}
                </button>
              </Can>
            </td>
          </tr>
        ))}
      </DataTable>
      {more}
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
  const [status, setStatus] = useState("");
  // P3.7: the priority safety queue shows priority 1+ (harassment, stalking,
  // unsafe locations…), highest first, with the time-to-first-action limit.
  const [priorityOnly, setPriorityOnly] = useState(false);
  const { data, loading, error, reload, more } = usePagedView<ReportItem>(
    "reports",
    {
      minPriority: priorityOnly ? "1" : undefined,
      status,
    },
  );
  const [selected, setSelected] = useState<ReportItem | null>(null);
  const [restoring, setRestoring] = useState<ReportItem | null>(null);
  return (
    <State loading={loading} error={error}>
      <ListToolbar>
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            ["", "All"],
            ["OPEN", "Open"],
            ["UNDER_REVIEW", "Under review"],
            ["ACTIONED", "Actioned"],
            ["DISMISSED", "Dismissed"],
          ]}
        />
      </ListToolbar>
      <Summary count={data?.total ?? 0} label={tr("safety reports")} />
      <label className="toggle-filter">
        <input
          type="checkbox"
          checked={priorityOnly}
          onChange={(event) => setPriorityOnly(event.target.checked)}
        />
        {tr("Priority safety queue only")}
      </label>
      <DataTable
        headers={["Report", "People", "Status", "Evidence", "Actions"]}
      >
        {(data?.items ?? []).map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{humanize(item.reasonCode)}</strong>
              {item.priority !== undefined && item.priority > 0 && (
                <Badge value={item.priority >= 2 ? "URGENT" : "PRIORITY"} />
              )}
              <small>
                {humanize(item.targetType)} {tr("\u00B7")}{" "}
                {formatDate(item.createdAt)}
              </small>
              {item.firstActionDueAt && (
                <small className={item.overdue ? "overdue" : undefined}>
                  {item.firstActionAt
                    ? `${tr("First action after")} ${formatMinutes(item.timeToFirstActionMinutes ?? 0)}`
                    : `${tr("Waiting")} ${formatMinutes(item.ageMinutes ?? 0)} ${tr("\u00B7")} ${tr("act by")} ${formatDate(item.firstActionDueAt)}`}
                  {item.overdue ? ` ${tr("\u00B7")} ${tr("Overdue")}` : ""}
                </small>
              )}
              {item.content && (
                <small>
                  {item.content.title || tr("(no title)")}{" "}
                  <Badge value={item.content.status} />
                </small>
              )}
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
                <Can route="POST reports/:id/review">
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
                </Can>
              )}
              {(item.status === "OPEN" || item.status === "UNDER_REVIEW") && (
                <Can route="POST reports/:id/decision">
                  <button onClick={() => setSelected(item)}>
                    {tr("Decide")}
                  </button>
                </Can>
              )}
              {item.content?.status === "HIDDEN" && (
                <Can route="POST content/:targetType/:id/restore">
                  <button onClick={() => setRestoring(item)}>
                    {tr("Restore content")}
                  </button>
                </Can>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
      {more}
      {restoring && (
        <ReasonDialog
          title={tr("Restore hidden content")}
          confirmLabel={tr("Restore content")}
          onClose={() => setRestoring(null)}
          onConfirm={async (reason) => {
            await adminApi(
              `content/${restoring.targetType}/${restoring.targetId}/restore`,
              json("POST", { reason }),
            );
            setRestoring(null);
            await reload();
          }}
        />
      )}
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
/** P2 content a report can hide (a business is suspended). */
const CONTENT_TARGETS = new Set([
  "BUSINESS",
  "BUSINESS_OFFERING",
  "IDEA",
  "IDEA_ROLE",
  "COLLABORATION_REQUEST",
  "INTRODUCTION",
  "SESSION",
  "GROUP",
]);
type ReportItem = {
  id: string;
  targetType: string;
  targetId: string;
  content?: { title: string; status: string } | null;
  priority?: number;
  ageMinutes?: number;
  firstActionDueAt?: string;
  firstActionAt?: string | null;
  timeToFirstActionMinutes?: number | null;
  overdue?: boolean;
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
  const [status, setStatus] = useState("");
  const { data, loading, error, reload, more } = usePagedView<
    RiskItem,
    {
      items: RiskItem[];
      total: number;
      metrics: {
        adjudicatedCount: number;
        observedFalsePositiveRateBps: number | null;
        observedPrecisionBps: number | null;
      };
    }
  >("risk/items", { status });
  const [scan, setScan] = useState(false);
  const [selected, setSelected] = useState<RiskItem | null>(null);
  const metrics = data?.metrics;
  return (
    <State loading={loading} error={error}>
      <ListToolbar>
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            ["", "All"],
            ["OPEN", "Open"],
            ["UNDER_REVIEW", "Under review"],
            ["CLEARED", "Cleared"],
            ["ESCALATED", "Escalated"],
          ]}
        />
      </ListToolbar>
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
        <Can route="POST risk/scan">
          <button onClick={() => setScan(true)}>
            {tr("Run reviewed scan")}
          </button>
        </Can>
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
                <Can route="POST risk/items/:id/review">
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
                </Can>
              )}
              {(item.status === "OPEN" || item.status === "UNDER_REVIEW") && (
                <Can route="POST risk/items/:id/decision">
                  <button onClick={() => setSelected(item)}>
                    {tr("Decide")}
                  </button>
                </Can>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
      {more}
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
  const isContent = CONTENT_TARGETS.has(report.targetType);
  const [hideContent, setHideContent] = useState(isContent);
  // For content, a user moderation step is optional.
  const [applyLevel, setApplyLevel] = useState(!isContent);
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
                ...(status === "ACTIONED" && applyLevel
                  ? {
                      action,
                      durationDays: Number(durationDays),
                      requireReverification,
                    }
                  : {}),
                ...(status === "ACTIONED" && isContent && hideContent
                  ? { hideContent: true }
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
        {status === "ACTIONED" && isContent && (
          <>
            <label>
              <input
                type="checkbox"
                checked={hideContent}
                onChange={(event) => setHideContent(event.target.checked)}
              />
              {tr("Hide the reported content")}
            </label>
            <label>
              <input
                type="checkbox"
                checked={applyLevel}
                onChange={(event) => setApplyLevel(event.target.checked)}
              />
              {tr("Also apply a moderation step to the person")}
            </label>
          </>
        )}
        {status === "ACTIONED" && applyLevel && (
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
          <button
            type="submit"
            disabled={
              status === "ACTIONED" &&
              (applyLevel ? !action : !(isContent && hideContent))
            }
          >
            {tr("Confirm decision")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
function Jobs() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const { data, loading, error, reload, more } = usePagedView<JobItem>("jobs", {
    search,
    status,
  });
  const [selected, setSelected] = useState<JobItem | null>(null);
  const [target, setTarget] = useState("SUSPENDED");
  return (
    <State loading={loading} error={error}>
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search job title"
      >
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            ["", "All"],
            ...JOB_STATUSES.map(
              (value) => [value, humanize(value)] as [string, string],
            ),
          ]}
        />
      </ListToolbar>
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
              <Can route="POST jobs/:id/force-transition">
                <button
                  onClick={() => {
                    setTarget(targetsFor(job)[0] ?? "SUSPENDED");
                    setSelected(job);
                  }}
                >
                  {tr("Force transition")}
                </button>
              </Can>
              <Can route="POST jobs/:id/feature">
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
              </Can>
            </td>
          </tr>
        ))}
      </DataTable>
      {more}
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
                {targetsFor(selected).map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
              <small>
                {tr("Only the next states the job rules allow are listed.")}
              </small>
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
/** The server's allowed next states; older APIs did not send them. */
function targetsFor(job: JobItem): string[] {
  return job.allowedTransitions ?? JOB_STATUSES;
}
type JobItem = {
  id: string;
  title: string;
  status: string;
  allowedTransitions?: string[];
  isFeatured: boolean;
  poster: {
    name: string;
  };
  applicationsCount: number;
  assignmentsCount: number;
};
function Applications() {
  const [search, setSearch] = useState("");
  const { data, loading, error, reload, more } = usePagedView<
    {
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
    }["items"][number]
  >("applications", { search });
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <State loading={loading} error={error}>
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search job or worker"
      />
      <DataTable headers={["Job", "Worker", "Status", "Action"]}>
        {(data?.items ?? []).map((item) => (
          <tr key={item.id}>
            <td>{item.job.title}</td>
            <td>{item.worker.name}</td>
            <td>
              <Badge value={item.status} />
            </td>
            <td>
              <Can route="POST applications/:id/unstick">
                <button
                  className="table-button"
                  onClick={() => setSelected(item.id)}
                >
                  {tr("Unstick")}
                </button>
              </Can>
            </td>
          </tr>
        ))}
      </DataTable>
      {more}
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
function Verification({ kind }: { kind?: string } = {}) {
  const [status, setStatus] = useState("");
  const { data, loading, error, reload, more } = usePagedView<VerificationItem>(
    "verification-requests",
    { kind, status },
  );
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
      <ListToolbar>
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            ["", "Needs a decision"],
            ["APPROVED", "Approved"],
            ["REJECTED", "Rejected"],
            ["EXPIRED", "Expired"],
          ]}
        />
      </ListToolbar>
      <DataTable
        headers={["Person", "Kind", "Documents", "Status", "Decision"]}
      >
        {(data?.items ?? []).map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{item.user.name}</strong>
              <small>{item.user.trustLevel}</small>
              {item.business && (
                <small>
                  {item.business.name} {tr("\u00B7")}{" "}
                  {humanize(item.business.stage)} {tr("\u00B7")}{" "}
                  {tr("Trade licence")}{" "}
                  {item.business.tradeLicenceNo ?? tr("None")}
                </small>
              )}
            </td>
            <td>{humanize(item.kind)}</td>
            <td className="actions">
              {item.documents.map((document) => (
                <Can route="GET verification-documents/:id">
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
                </Can>
              ))}
              {!item.documents.length && tr("None")}
            </td>
            <td>
              <Badge value={item.status} />
            </td>
            <td className="actions">
              <Can route="POST verification-requests/:id/decision">
                <button
                  onClick={() => setDecision({ item, status: "APPROVED" })}
                >
                  {tr("Approve")}
                </button>
              </Can>
              <Can route="POST verification-requests/:id/decision">
                <button
                  onClick={() => setDecision({ item, status: "REJECTED" })}
                >
                  {tr("Reject")}
                </button>
              </Can>
            </td>
          </tr>
        ))}
      </DataTable>
      {more}
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
  business?: {
    id: string;
    name: string;
    stage: string;
    tradeLicenceNo: string | null;
    address: string | null;
  } | null;
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
/** Tabs the role can open; a tab it cannot open is not shown. */
function TabbedModule({
  module,
  role,
  intro,
  views,
}: {
  module: ConsoleModule;
  role: string;
  intro?: string;
  views: Record<string, () => ReactNode>;
}) {
  const tabs = visibleTabs(role, module);
  const [selected, setTab] = useState(tabs[0]?.key ?? "");
  const tab = tabs.some((item) => item.key === selected)
    ? selected
    : (tabs[0]?.key ?? "");
  return (
    <>
      <div className="learn-tabs" role="tablist" aria-label={tr(module.name)}>
        {tabs.map(({ key, name }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {tr(name)}
          </button>
        ))}
      </div>
      {intro && <p className="muted">{tr(intro)}</p>}
      <div role="tabpanel">{views[tab]?.()}</div>
    </>
  );
}
type AdminPerson = { userId: string; name: string };
type CommunityGroupItem = {
  id: string;
  name: string;
  visibility: string;
  womenOnly: boolean;
  memberCount: number;
  moderators: AdminPerson[];
  ambassadors: AdminPerson[];
  openReports: number;
  status: string;
  hiddenReason: string | null;
};
/** Hide or restore a GROUP / SESSION with a reason. */
function useContentToggle(reload: () => Promise<void>) {
  const [target, setTarget] = useState<{
    type: string;
    id: string;
    hide: boolean;
  } | null>(null);
  const dialog = target && (
    <ReasonDialog
      title={target.hide ? tr("Hide content") : tr("Restore content")}
      confirmLabel={target.hide ? tr("Hide content") : tr("Restore content")}
      onClose={() => setTarget(null)}
      onConfirm={async (reason) => {
        await adminApi(
          `content/${target.type}/${target.id}/${target.hide ? "hide" : "restore"}`,
          json("POST", { reason }),
        );
        setTarget(null);
        await reload();
      }}
    />
  );
  return { setTarget, dialog };
}
function CommunityGroups() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const { data, loading, error, reload, more } =
    usePagedView<CommunityGroupItem>("community/groups", { q: search, status });
  const { setTarget, dialog } = useContentToggle(reload);
  return (
    <State loading={loading} error={error}>
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search groups"
      >
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            ["", "All"],
            ["ACTIVE", "Active"],
            ["HIDDEN", "Hidden"],
          ]}
        />
      </ListToolbar>
      <DataTable
        headers={[
          "Group",
          "Moderators",
          "Members",
          "Reports",
          "Status",
          "Actions",
        ]}
      >
        {(data?.items ?? []).map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{item.name}</strong>
              <small>
                {humanize(item.visibility)}
                {item.womenOnly ? ` ${tr("\u00B7")} ${tr("Women only")}` : ""}
              </small>
            </td>
            <td>
              {item.moderators.map((person) => person.name).join(", ")}
              {item.ambassadors.length > 0 && (
                <small>
                  {tr("Ambassadors")}:{" "}
                  {item.ambassadors.map((person) => person.name).join(", ")}
                </small>
              )}
            </td>
            <td>{item.memberCount}</td>
            <td>{item.openReports}</td>
            <td>
              <Badge value={item.status} />
              {item.hiddenReason && <small>{item.hiddenReason}</small>}
            </td>
            <td className="actions">
              <Can route="POST content/:targetType/:id/hide">
                <button
                  onClick={() =>
                    setTarget({
                      type: "GROUP",
                      id: item.id,
                      hide: item.status !== "HIDDEN",
                    })
                  }
                >
                  {item.status === "HIDDEN"
                    ? tr("Restore content")
                    : tr("Hide content")}
                </button>
              </Can>
            </td>
          </tr>
        ))}
      </DataTable>
      {more}
      {dialog}
    </State>
  );
}
type AdminSessionItem = {
  id: string;
  kind: string;
  title: string;
  status: string;
  startsAt: string;
  mode: string;
  capacity: number;
  accepted: number;
  waitlisted: number;
  attended: number;
  womenOnly: boolean;
  host: AdminPerson;
  group: { id: string; name: string } | null;
  openReports: number;
  visibility: string;
  hiddenReason: string | null;
};
function CommunitySessions() {
  const [kind, setKind] = useState("");
  const { data, loading, error, reload, more } = usePagedView<AdminSessionItem>(
    "sessions",
    { kind },
  );
  const { setTarget, dialog } = useContentToggle(reload);
  return (
    <State loading={loading} error={error}>
      <ListToolbar>
        <FilterSelect
          label="Kind"
          value={kind}
          onChange={setKind}
          options={[
            ["", "All"],
            ["CONSULTATION", "Consultation"],
            ["GROUP_DISCUSSION", "Group discussion"],
            ["WORKSHOP", "Workshop"],
            ["EVENT", "Event"],
          ]}
        />
      </ListToolbar>
      <DataTable
        headers={["Session", "Host", "Places", "Reports", "Status", "Actions"]}
      >
        {(data?.items ?? []).map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{item.title}</strong>
              <small>
                {humanize(item.kind)} {tr("\u00B7")} {humanize(item.mode)}{" "}
                {tr("\u00B7")} {formatDate(item.startsAt)}
              </small>
              {item.group && <small>{item.group.name}</small>}
            </td>
            <td>{item.host.name}</td>
            <td>
              {item.accepted}/{item.capacity}
              {item.waitlisted > 0 && (
                <small>
                  {tr("Waitlist")}: {item.waitlisted}
                </small>
              )}
            </td>
            <td>{item.openReports}</td>
            <td>
              <Badge value={item.status} />
              {item.visibility === "HIDDEN" && <Badge value="HIDDEN" />}
            </td>
            <td className="actions">
              <Can route="POST content/:targetType/:id/hide">
                <button
                  onClick={() =>
                    setTarget({
                      type: "SESSION",
                      id: item.id,
                      hide: item.visibility !== "HIDDEN",
                    })
                  }
                >
                  {item.visibility === "HIDDEN"
                    ? tr("Restore content")
                    : tr("Hide content")}
                </button>
              </Can>
            </td>
          </tr>
        ))}
      </DataTable>
      {more}
      {dialog}
    </State>
  );
}
type AmbassadorItem = {
  userId: string;
  name: string;
  groups: Array<{ id: string; name: string; hidden: boolean }>;
};
function Ambassadors() {
  const { data, loading, error, reload } = useData<{ items: AmbassadorItem[] }>(
    "community/ambassadors",
  );
  const [removing, setRemoving] = useState<{
    userId: string;
    groupId: string;
  } | null>(null);
  return (
    <State loading={loading} error={error}>
      <DataTable headers={["Ambassador", "Groups", "Actions"]}>
        {(data?.items ?? []).flatMap((item) =>
          item.groups.map((group) => (
            <tr key={`${item.userId}-${group.id}`}>
              <td>
                <strong>{item.name}</strong>
              </td>
              <td>{group.name}</td>
              <td className="actions">
                <Can route="POST community/groups/:id/members/:userId/role">
                  <button
                    onClick={() =>
                      setRemoving({ userId: item.userId, groupId: group.id })
                    }
                  >
                    {tr("Remove ambassador role")}
                  </button>
                </Can>
              </td>
            </tr>
          )),
        )}
      </DataTable>
      {removing && (
        <ReasonDialog
          title={tr("Remove ambassador role")}
          confirmLabel={tr("Remove ambassador role")}
          onClose={() => setRemoving(null)}
          onConfirm={async (reason) => {
            await adminApi(
              `community/groups/${removing.groupId}/members/${removing.userId}/role`,
              json("POST", { role: "MEMBER", reason }),
            );
            setRemoving(null);
            await reload();
          }}
        />
      )}
    </State>
  );
}
type SectorItem = {
  id: string;
  parentId: string | null;
  slug: string;
  nameEn: string;
  nameBn: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
};
function Sectors() {
  const { data, loading, error, reload } = useData<{ items: SectorItem[] }>(
    "business-categories",
  );
  const [editing, setEditing] = useState<SectorItem | "new" | null>(null);
  const items = data?.items ?? [];
  const name = (item: SectorItem) =>
    getActiveAdminLocale() === "bn" ? item.nameBn : item.nameEn;
  return (
    <State loading={loading} error={error}>
      <div className="dialog-actions">
        <Can route="POST business-categories">
          <button onClick={() => setEditing("new")}>{tr("Add sector")}</button>
        </Can>
      </div>
      <DataTable headers={["Sector", "Parent", "Order", "Active", "Actions"]}>
        {items.map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{name(item)}</strong>
              <small>
                {getActiveAdminLocale() === "bn" ? item.nameEn : item.nameBn}{" "}
                {tr("\u00B7")} {item.slug}
              </small>
            </td>
            <td>
              {(() => {
                const parent = items.find((row) => row.id === item.parentId);
                return parent ? name(parent) : tr("Top level");
              })()}
            </td>
            <td>{item.sortOrder}</td>
            <td>
              <Badge value={item.isActive ? "ACTIVE" : "INACTIVE"} />
            </td>
            <td className="actions">
              <Can route="PUT business-categories/:id">
                <button onClick={() => setEditing(item)}>{tr("Edit")}</button>
              </Can>
            </td>
          </tr>
        ))}
      </DataTable>
      {editing && (
        <SectorDialog
          sector={editing === "new" ? null : editing}
          parents={items.filter(
            (item) =>
              !item.parentId && (editing === "new" || item.id !== editing.id),
          )}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
    </State>
  );
}
function SectorDialog({
  sector,
  parents,
  onClose,
  onSaved,
}: {
  sector: SectorItem | null;
  parents: SectorItem[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    slug: sector?.slug ?? "",
    nameEn: sector?.nameEn ?? "",
    nameBn: sector?.nameBn ?? "",
    parentId: sector?.parentId ?? "",
    icon: sector?.icon ?? "",
    sortOrder: String(sector?.sortOrder ?? 0),
    isActive: sector?.isActive ?? true,
  });
  const [error, setError] = useState("");
  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <Dialog
      title={sector ? tr("Edit sector") : tr("Add sector")}
      onClose={onClose}
    >
      <form
        onSubmit={async (event: FormEvent) => {
          event.preventDefault();
          setError("");
          try {
            await adminApi(
              sector
                ? `business-categories/${sector.id}`
                : "business-categories",
              json(sector ? "PUT" : "POST", {
                slug: form.slug.trim(),
                nameEn: form.nameEn.trim(),
                nameBn: form.nameBn.trim(),
                parentId: form.parentId || null,
                icon: form.icon.trim() || null,
                sortOrder: Number(form.sortOrder) || 0,
                isActive: form.isActive,
              }),
            );
            await onSaved();
          } catch (caught) {
            setError(friendlyAdminError(caught));
          }
        }}
      >
        <label>
          {tr("Slug")}
          <input
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            value={form.slug}
            onChange={(event) => set("slug", event.target.value)}
          />
        </label>
        <label>
          {tr("Name (English)")}
          <input
            required
            minLength={2}
            value={form.nameEn}
            onChange={(event) => set("nameEn", event.target.value)}
          />
        </label>
        <label>
          {tr("Name (Bangla)")}
          <input
            required
            minLength={2}
            value={form.nameBn}
            onChange={(event) => set("nameBn", event.target.value)}
          />
        </label>
        <label>
          {tr("Parent sector")}
          <select
            value={form.parentId}
            onChange={(event) => set("parentId", event.target.value)}
          >
            <option value="">{tr("Top level")}</option>
            {parents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {localizedEntityName(parent.nameEn, parent.nameBn)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr("Order")}
          <input
            type="number"
            min="0"
            value={form.sortOrder}
            onChange={(event) => set("sortOrder", event.target.value)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) => set("isActive", event.target.checked)}
          />
          {tr("Active")}
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {tr("Cancel")}
          </button>
          <button type="submit">{tr("Save sector")}</button>
        </div>
      </form>
    </Dialog>
  );
}
type SkillName = { skillId: string; nameEn: string; nameBn: string };
type MentorApplicationItem = VerificationItem & {
  mentorApplication: {
    bio: string | null;
    yearsExperience: number | null;
    skills: Array<SkillName & { level: string }>;
  } | null;
};
function skillName(skill: { nameEn: string; nameBn: string }) {
  return getActiveAdminLocale() === "bn" ? skill.nameBn : skill.nameEn;
}
function MentorApplications() {
  const { data, loading, error, reload, more } =
    usePagedView<MentorApplicationItem>("verification-requests", {
      kind: "MENTOR",
    });
  const [decision, setDecision] = useState<{
    item: MentorApplicationItem;
    status: "APPROVED" | "REJECTED";
  } | null>(null);
  return (
    <State loading={loading} error={error}>
      <Summary count={data?.items.length ?? 0} label="mentor applications" />
      <DataTable
        headers={["Person", "Teaches", "Experience", "Documents", "Decision"]}
      >
        {(data?.items ?? []).map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{item.user.name}</strong>
              <small>{item.user.trustLevel}</small>
            </td>
            <td>
              {(item.mentorApplication?.skills ?? [])
                .map(
                  (skill) => `${skillName(skill)} (${humanize(skill.level)})`,
                )
                .join(", ")}
            </td>
            <td>
              <strong>
                {item.mentorApplication?.yearsExperience ?? 0} {tr("years")}
              </strong>
              <small>{item.mentorApplication?.bio}</small>
            </td>
            <td className="actions">
              {item.documents.map((document) => (
                <Can route="GET verification-documents/:id">
                  <button
                    key={document.id}
                    onClick={async () => {
                      const view = await adminApi<{ downloadUrl: string }>(
                        `verification-documents/${document.id}`,
                      );
                      window.open(view.downloadUrl, "_blank", "noopener");
                    }}
                  >
                    {tr("View")} {humanize(document.kind)}
                  </button>
                </Can>
              ))}
            </td>
            <td className="actions">
              <Can route="POST verification-requests/:id/decision">
                <button
                  onClick={() => setDecision({ item, status: "APPROVED" })}
                >
                  {tr("Approve")}
                </button>
              </Can>
              <Can route="POST verification-requests/:id/decision">
                <button
                  onClick={() => setDecision({ item, status: "REJECTED" })}
                >
                  {tr("Reject")}
                </button>
              </Can>
            </td>
          </tr>
        ))}
      </DataTable>
      {more}
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
    </State>
  );
}
type OpportunityItem = {
  id: string;
  title: string;
  opportunityType: string;
  status: string;
  termsText: { en: string; bn: string };
  seats: number;
  seatsFilled: number;
  applications: number;
  mentor: { userId: string; name: string; mentorStatus: string };
  actions: Array<"suspend" | "restore">;
};
function LearningOpportunities() {
  const [search, setSearch] = useState("");
  const { data, loading, error, reload, more } = usePagedView<OpportunityItem>(
    "learning-opportunities",
    { search },
  );
  const [pending, setPending] = useState<{
    title: string;
    path: string;
    label: string;
  } | null>(null);
  return (
    <State loading={loading} error={error}>
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search opportunities"
      />
      <Summary count={data?.items.length ?? 0} label="learning opportunities" />
      <DataTable
        headers={[
          "Opportunity",
          "Mentor",
          "Terms",
          "Seats",
          "Status",
          "Actions",
        ]}
      >
        {(data?.items ?? []).map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{item.title}</strong>
              <small>{humanize(item.opportunityType)}</small>
            </td>
            <td>
              <strong>{item.mentor.name}</strong>
              <small>{humanize(item.mentor.mentorStatus)}</small>
            </td>
            <td>
              {getActiveAdminLocale() === "bn"
                ? item.termsText.bn
                : item.termsText.en}
            </td>
            <td>
              {item.seatsFilled} / {item.seats}
              <small>
                {item.applications} {tr("applications")}
              </small>
            </td>
            <td>
              <Badge value={item.status} />
            </td>
            <td className="actions">
              {item.actions.map((action) => (
                <Can route="POST learning-opportunities/:id/suspend">
                  <button
                    key={action}
                    onClick={() =>
                      setPending({
                        title: `${tr(humanize(action))}: ${item.title}`,
                        path: `learning-opportunities/${item.id}/${action}`,
                        label: humanize(action),
                      })
                    }
                  >
                    {tr(humanize(action))}
                  </button>
                </Can>
              ))}
              {item.mentor.mentorStatus === "APPROVED" && (
                <Can route="POST mentors/:userId/suspend">
                  <button
                    onClick={() =>
                      setPending({
                        title: `${tr("Suspend mentor")}: ${item.mentor.name}`,
                        path: `mentors/${item.mentor.userId}/suspend`,
                        label: "Suspend mentor",
                      })
                    }
                  >
                    {tr("Suspend mentor")}
                  </button>
                </Can>
              )}
              {item.mentor.mentorStatus === "SUSPENDED" && (
                <Can route="POST mentors/:userId/reinstate">
                  <button
                    onClick={() =>
                      setPending({
                        title: `${tr("Reinstate mentor")}: ${item.mentor.name}`,
                        path: `mentors/${item.mentor.userId}/reinstate`,
                        label: "Reinstate mentor",
                      })
                    }
                  >
                    {tr("Reinstate mentor")}
                  </button>
                </Can>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
      {more}
      {pending && (
        <ReasonDialog
          title={pending.title}
          confirmLabel={pending.label}
          onClose={() => setPending(null)}
          onConfirm={async (reason) => {
            await adminApi(pending.path, json("POST", { reason }));
            setPending(null);
            await reload();
          }}
        />
      )}
    </State>
  );
}
type CourseItem = {
  id: string;
  slug: string;
  titleEn: string;
  titleBn: string;
  isPublished: boolean;
  version: number;
  lessons: number;
  activeQuestions: number;
};
const NEW_COURSE_TEMPLATE = {
  slug: "new-course",
  skillSlug: null,
  titleEn: "",
  titleBn: "",
  summaryEn: "",
  summaryBn: "",
  minutes: 10,
  estDataMb: 5,
  passMarkPct: 70,
  questionCount: 5,
  isSafetyCritical: false,
  sortOrder: 0,
  lessons: [],
  questions: [],
};
function Courses() {
  const { data, loading, error, reload } = useData<{ items: CourseItem[] }>(
    "training/courses",
  );
  const [editing, setEditing] = useState<{
    id: string | null;
    text: string;
  } | null>(null);
  const [publishing, setPublishing] = useState<{
    item: CourseItem;
    publish: boolean;
  } | null>(null);
  const [message, setMessage] = useState("");
  return (
    <State loading={loading} error={error}>
      <div className="actions">
        <Can route="POST training/courses">
          <button
            className="primary"
            onClick={() =>
              setEditing({
                id: null,
                text: JSON.stringify(NEW_COURSE_TEMPLATE, null, 2),
              })
            }
          >
            {tr("New course")}
          </button>
        </Can>
        {message && <span role="status">{message}</span>}
      </div>
      <DataTable
        headers={["Course", "Version", "Content", "Status", "Actions"]}
      >
        {(data?.items ?? []).map((item) => (
          <tr key={item.id}>
            <td>
              <strong>
                {getActiveAdminLocale() === "bn" ? item.titleBn : item.titleEn}
              </strong>
              <small>{item.slug}</small>
            </td>
            <td>v{item.version}</td>
            <td>
              {item.lessons} {tr("lessons")} {tr("·")} {item.activeQuestions}{" "}
              {tr("questions")}
            </td>
            <td>
              <Badge value={item.isPublished ? "PUBLISHED" : "DRAFT"} />
            </td>
            <td className="actions">
              <Can
                route={["GET training/courses/:id", "PUT training/courses/:id"]}
              >
                <button
                  onClick={async () => {
                    const course = await adminApi<{ document: unknown }>(
                      `training/courses/${item.id}`,
                    );
                    setEditing({
                      id: item.id,
                      text: JSON.stringify(course.document, null, 2),
                    });
                  }}
                >
                  {tr("Edit")}
                </button>
              </Can>
              <Can route="POST training/courses/:id/publish">
                <button
                  onClick={() =>
                    setPublishing({ item, publish: !item.isPublished })
                  }
                >
                  {tr(item.isPublished ? "Unpublish" : "Publish")}
                </button>
              </Can>
            </td>
          </tr>
        ))}
      </DataTable>
      {editing && (
        <CourseEditor
          initial={editing.text}
          isNew={editing.id === null}
          onClose={() => setEditing(null)}
          onSave={async (document) => {
            const saved = editing.id
              ? await adminApi<{ outcome: string; version: number }>(
                  `training/courses/${editing.id}`,
                  json("PUT", { document }),
                )
              : await adminApi<{ version: number }>(
                  "training/courses",
                  json("POST", { document }),
                );
            setMessage(
              `${tr("Saved")}: v${saved.version}${
                "outcome" in saved
                  ? ` (${humanize(String(saved.outcome))})`
                  : ""
              }`,
            );
            setEditing(null);
            await reload();
          }}
        />
      )}
      {publishing && (
        <ReasonDialog
          title={`${tr(publishing.publish ? "Publish" : "Unpublish")}: ${publishing.item.titleEn}`}
          confirmLabel={publishing.publish ? "Publish" : "Unpublish"}
          onClose={() => setPublishing(null)}
          onConfirm={async (reason) => {
            await adminApi(
              `training/courses/${publishing.item.id}/${
                publishing.publish ? "publish" : "unpublish"
              }`,
              json("POST", { reason }),
            );
            setPublishing(null);
            await reload();
          }}
        />
      )}
    </State>
  );
}
function CourseEditor({
  initial,
  isNew,
  onClose,
  onSave,
}: {
  initial: string;
  isNew: boolean;
  onClose: () => void;
  onSave: (document: unknown) => Promise<void>;
}) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title={tr(isNew ? "New course" : "Edit course")} onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          let document: unknown;
          try {
            document = JSON.parse(text);
          } catch {
            setError(tr("The course document is not valid JSON."));
            return;
          }
          setBusy(true);
          try {
            await onSave(document);
          } catch (caught) {
            setError(friendlyAdminError(caught));
            setBusy(false);
          }
        }}
      >
        <p>
          {tr(
            "Changing lessons or questions creates a new version; earlier certificates stop counting for it.",
          )}
        </p>
        <label>
          {tr("Course document (JSON)")}
          <textarea
            className="code-editor"
            rows={20}
            value={text}
            onChange={(event) => setText(event.target.value)}
            spellCheck={false}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {tr(busy ? "Applying…" : "Save course")}
        </button>
      </form>
    </Dialog>
  );
}
type CertificateItem = {
  id: string;
  kind: string;
  code: string;
  title: string | null;
  holder: { name: string };
  issuedBy: { name: string } | null;
  status: string;
};
function CompletionRecords() {
  const [search, setSearch] = useState("");
  const { data, loading, error, reload, more } = usePagedView<CertificateItem>(
    "certificates",
    { search },
  );
  const [revoking, setRevoking] = useState<CertificateItem | null>(null);
  return (
    <State loading={loading} error={error}>
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search code or holder"
      />
      <DataTable headers={["Code", "Holder", "Record", "Status", "Actions"]}>
        {(data?.items ?? []).map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{item.code}</strong>
              <small>{humanize(item.kind)}</small>
            </td>
            <td>{item.holder.name}</td>
            <td>
              <strong>{item.title}</strong>
              {item.issuedBy && (
                <small>
                  {tr("Checked by")} {item.issuedBy.name}
                </small>
              )}
            </td>
            <td>
              <Badge value={item.status} />
            </td>
            <td className="actions">
              {item.status === "VALID" && (
                <Can route="POST certificates/:id/revoke">
                  <button onClick={() => setRevoking(item)}>
                    {tr("Revoke")}
                  </button>
                </Can>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
      {more}
      {revoking && (
        <ReasonDialog
          title={`${tr("Revoke")}: ${revoking.code}`}
          confirmLabel="Revoke"
          onClose={() => setRevoking(null)}
          onConfirm={async (reason) => {
            await adminApi(
              `certificates/${revoking.id}/revoke`,
              json("POST", { reason }),
            );
            setRevoking(null);
            await reload();
          }}
        />
      )}
    </State>
  );
}
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
              <Can route="PUT categories/:id">
                <button
                  className={item.requiresManualApproval ? "on" : ""}
                  onClick={() => toggle(item, "requiresManualApproval")}
                >
                  {tr("Manual approval")}
                </button>
              </Can>
              <Can route="PUT categories/:id">
                <button
                  className={item.requiresIdentity ? "on" : ""}
                  onClick={() => toggle(item, "requiresIdentity")}
                >
                  {tr("Identity")}
                </button>
              </Can>
              <Can route="PUT categories/:id">
                <button
                  className={item.requiresCertificate ? "on" : ""}
                  onClick={() => toggle(item, "requiresCertificate")}
                >
                  {tr("Certificate")}
                </button>
              </Can>
              <Can route="PUT categories/:id">
                <button
                  className={item.unsafeForStudents ? "on danger" : ""}
                  onClick={() => toggle(item, "unsafeForStudents")}
                >
                  {tr("Student restriction")}
                </button>
              </Can>
            </td>
            <td>
              <Can route="PUT categories/:id">
                <button
                  className={`switch ${item.isActive ? "on" : ""}`}
                  aria-label={`${tr("Toggle")} ${localizedEntityName(item.nameEn, item.nameBn)}`}
                  onClick={() => toggle(item, "isActive")}
                >
                  <span />
                </button>
              </Can>
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
        <Can route="POST locations">
          <button
            className="primary small-button"
            onClick={() => setAdding(true)}
          >
            {tr("Add location")}
          </button>
        </Can>
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
              <Can route="PUT locations/:id">
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
              </Can>
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
            <Can route="POST config/:key/preview">
              <button onClick={previewChange}>{tr("Preview diff")}</button>
            </Can>
            {preview && (
              <Can route="PUT config/:key">
                <button className="primary small-button" onClick={save}>
                  {tr("Confirm change")}
                </button>
              </Can>
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
              <Can route="POST config/revisions/:id/revert">
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
              </Can>
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
        <Can route="PUT flags/:key">
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
        </Can>
      </td>
    </tr>
  );
}
function Disputes() {
  const [status, setStatus] = useState("");
  const { data, loading, error, reload, more } = usePagedView<DisputeItem>(
    "disputes",
    { status },
  );
  const [selected, setSelected] = useState<DisputeItem | null>(null);
  return (
    <State loading={loading} error={error}>
      <ListToolbar>
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            ["", "All"],
            ["OPEN", "Open"],
            ["UNDER_REVIEW", "Under review"],
            ["RESOLVED", "Resolved"],
            ["EVIDENCE", "Evidence"],
            ["CLOSED", "Closed"],
          ]}
        />
      </ListToolbar>
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
                <Can route="POST disputes/:id/review">
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
                </Can>
              )}
              <Can route="POST disputes/:id/resolve">
                <button
                  className="table-button"
                  onClick={() => setSelected(item)}
                >
                  {tr("Resolve")}
                </button>
              </Can>
            </td>
          </tr>
        ))}
      </DataTable>
      {more}
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
type CampaignItem = {
  id: string;
  name: string;
  title: string;
  audienceCount: number;
  sentCount: number;
  throttlePerMinute: number;
  status: string;
  createdBy: string | null;
  createdAt: string;
  completedAt: string | null;
};
function Notifications() {
  const [result, setResult] = useState<{
    audienceCount: number;
    preview: {
      title: string;
      body: string;
    };
  } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const history = useData<{ items: CampaignItem[] }>(
    "notifications/campaigns?limit=20",
  );
  const [payload, setPayload] = useState({
    name: "Pilot update",
    title: "KAAJ update",
    body: "A marketplace update is available.",
    segment: { status: "ACTIVE" },
    throttlePerMinute: 100,
  });
  async function dryRun() {
    setError("");
    setNotice("");
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
    setError("");
    try {
      const sent = await adminApi<{
        audienceCount: number;
        sentCount: number;
        status: string;
      }>("notifications/campaign/send", json("POST", payload));
      setResult(null);
      setConfirming(false);
      setNotice(
        tr(
          `Sent to ${sent.sentCount} of ${sent.audienceCount}. The rest go out ${payload.throttlePerMinute} per minute.`,
        ),
      );
      await history.reload();
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setSending(false);
    }
  }
  const minutes = result
    ? Math.max(
        0,
        Math.ceil(result.audienceCount / payload.throttlePerMinute) - 1,
      )
    : 0;
  return (
    <>
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
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {notice && <p className="success">{notice}</p>}
          <div className="actions">
            <button onClick={dryRun}>{tr("Run dry-run")}</button>
            {result && (
              <Can route="POST notifications/campaign/send">
                <button
                  className="primary small-button"
                  disabled={sending}
                  onClick={() => setConfirming(true)}
                >
                  {tr("Send campaign")}
                </button>
              </Can>
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
            <em>
              {tr(`${result.audienceCount} recipients match this segment`)}
            </em>
          )}
        </section>
      </div>
      <Section
        title="Campaign history"
        note="Large audiences are sent in batches, one batch per minute"
      >
        <State loading={history.loading} error={history.error}>
          <DataTable
            headers={["Campaign", "Progress", "Status", "Started", "By"]}
            empty={!history.data?.items.length}
          >
            {(history.data?.items ?? []).map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                  <small>{item.title}</small>
                </td>
                <td>
                  {formatNumber(item.sentCount)} /{" "}
                  {formatNumber(item.audienceCount)}
                  <small>
                    {formatNumber(item.throttlePerMinute)} {tr("per minute")}
                  </small>
                </td>
                <td>
                  <Badge value={item.status} />
                </td>
                <td>{formatDate(item.createdAt)}</td>
                <td>{item.createdBy ?? tr("System")}</td>
              </tr>
            ))}
          </DataTable>
          <div className="actions">
            <button onClick={() => void history.reload()}>
              {tr("Refresh")}
            </button>
          </div>
        </State>
      </Section>
      {confirming && result && (
        <Dialog
          title="Send this campaign?"
          onClose={() => setConfirming(false)}
        >
          <p>
            {tr(
              `${result.audienceCount} people will get "${payload.title}". The first ${Math.min(payload.throttlePerMinute, result.audienceCount)} get it now; the rest over about ${minutes} more minutes.`,
            )}
          </p>
          <p className="muted">
            {tr("A sent notification cannot be recalled.")}
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <button onClick={() => setConfirming(false)}>{tr("Cancel")}</button>
            <button
              className="primary small-button"
              disabled={sending}
              onClick={send}
            >
              {tr(sending ? "Sending…" : "Confirm send")}
            </button>
          </div>
        </Dialog>
      )}
    </>
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
