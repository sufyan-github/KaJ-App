"use client";
import { FormEvent, useState } from "react";
import { adminApi, json } from "@/lib/admin-api";
import { friendlyAdminError, localizedEntityName, tr } from "@/lib/admin-i18n";
import {
  Badge,
  Can,
  DataTable,
  Dialog,
  FilterSelect,
  ListToolbar,
  LoadMore,
  ReasonDialog,
  State,
  formatDate,
  humanize,
  useData,
  usePagedData,
} from "../ui";

type Person = { userId: string; name: string | null };
const VISIBILITY: ReadonlyArray<[string, string]> = [
  ["all", "All"],
  ["visible", "Visible"],
  ["hidden", "Hidden"],
];

/** Hide or restore content through POST content/:targetType/:id/(hide|restore). */
function useContentAction(reload: () => Promise<void>) {
  const [pending, setPending] = useState<{
    type: "BUSINESS" | "IDEA" | "INTRODUCTION";
    id: string;
    title: string;
    hidden: boolean;
  } | null>(null);
  const dialog = pending && (
    <ReasonDialog
      title={`${pending.hidden ? "Restore" : "Hide"}: ${pending.title}`}
      confirmLabel={pending.hidden ? "Restore content" : "Hide content"}
      onClose={() => setPending(null)}
      onConfirm={async (reason) => {
        await adminApi(
          `content/${pending.type}/${pending.id}/${pending.hidden ? "restore" : "hide"}`,
          json("POST", { reason }),
        );
        setPending(null);
        await reload();
      }}
    />
  );
  return { open: setPending, dialog };
}

function HideButton({
  hidden,
  onClick,
}: {
  hidden: boolean;
  onClick: () => void;
}) {
  return (
    <Can
      route={
        hidden
          ? "POST content/:targetType/:id/restore"
          : "POST content/:targetType/:id/hide"
      }
    >
      <button onClick={onClick}>
        {tr(hidden ? "Restore content" : "Hide content")}
      </button>
    </Can>
  );
}

// ---------------------------------------------------------------- Skills

type SkillItem = {
  id: string;
  categoryId: string;
  slug: string;
  nameEn: string;
  nameBn: string;
  isActive: boolean;
};
type CategoryOption = {
  id: string;
  parentId?: string;
  nameEn: string;
  nameBn: string;
};

/** The skills taxonomy under work categories (was backend only). */
export function Skills() {
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const categories = useData<{ items: CategoryOption[] }>("categories");
  const skills = useData<{ items: SkillItem[] }>(
    categoryId ? `skills?categoryId=${categoryId}` : "skills",
  );
  const [editing, setEditing] = useState<SkillItem | "new" | null>(null);
  const names = new Map(
    (categories.data?.items ?? []).map((c) => [
      c.id,
      localizedEntityName(c.nameEn, c.nameBn),
    ]),
  );
  const needle = search.toLowerCase();
  const items = (skills.data?.items ?? []).filter(
    (skill) =>
      !needle ||
      [skill.nameEn, skill.nameBn, skill.slug].some((value) =>
        value.toLowerCase().includes(needle),
      ),
  );
  return (
    <State
      loading={skills.loading || categories.loading}
      error={skills.error || categories.error}
    >
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search skills"
      >
        <FilterSelect
          label="Category"
          value={categoryId}
          options={[
            ["", "All categories"],
            ...(categories.data?.items ?? []).map(
              (c) =>
                [c.id, localizedEntityName(c.nameEn, c.nameBn)] as [
                  string,
                  string,
                ],
            ),
          ]}
          onChange={setCategoryId}
        />
        <Can route="POST skills">
          <button
            className="primary small-button"
            onClick={() => setEditing("new")}
          >
            {tr("Add skill")}
          </button>
        </Can>
      </ListToolbar>
      <DataTable
        headers={["Skill", "Category", "Status", "Action"]}
        empty={!items.length}
      >
        {items.map((skill) => (
          <tr key={skill.id}>
            <td>
              <strong>{localizedEntityName(skill.nameEn, skill.nameBn)}</strong>
              <small>{skill.slug}</small>
            </td>
            <td>{names.get(skill.categoryId) ?? skill.categoryId}</td>
            <td>
              <Badge value={skill.isActive ? "ACTIVE" : "INACTIVE"} />
            </td>
            <td className="actions">
              <Can route="PUT skills/:id">
                <button onClick={() => setEditing(skill)}>{tr("Edit")}</button>
              </Can>
            </td>
          </tr>
        ))}
      </DataTable>
      {editing && (
        <SkillDialog
          skill={editing === "new" ? null : editing}
          categories={categories.data?.items ?? []}
          defaultCategoryId={categoryId}
          onClose={() => setEditing(null)}
          onDone={async () => {
            setEditing(null);
            await skills.reload();
          }}
        />
      )}
    </State>
  );
}

function SkillDialog({
  skill,
  categories,
  defaultCategoryId,
  onClose,
  onDone,
}: {
  skill: SkillItem | null;
  categories: CategoryOption[];
  defaultCategoryId: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const body = {
        categoryId: String(form.get("categoryId")),
        slug: String(form.get("slug")).trim(),
        nameEn: String(form.get("nameEn")).trim(),
        nameBn: String(form.get("nameBn")).trim(),
        isActive: form.get("isActive") === "on",
      };
      await adminApi(
        skill ? `skills/${skill.id}` : "skills",
        json(skill ? "PUT" : "POST", body),
      );
      await onDone();
    } catch (caught) {
      setError(friendlyAdminError(caught));
      setBusy(false);
    }
  }
  return (
    <Dialog title={skill ? "Edit skill" : "Add skill"} onClose={onClose}>
      <form onSubmit={submit}>
        <label>
          {tr("Category")}
          <select
            name="categoryId"
            defaultValue={skill?.categoryId ?? defaultCategoryId}
            required
          >
            <option value="">{tr("Choose a category")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {localizedEntityName(c.nameEn, c.nameBn)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr("Slug")}
          <input
            name="slug"
            defaultValue={skill?.slug}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            required
          />
        </label>
        <label>
          {tr("English name")}
          <input
            name="nameEn"
            defaultValue={skill?.nameEn}
            minLength={2}
            required
          />
        </label>
        <label>
          {tr("Bangla name")}
          <input
            name="nameBn"
            defaultValue={skill?.nameBn}
            minLength={2}
            required
          />
        </label>
        <label className="checkbox">
          <input
            name="isActive"
            type="checkbox"
            defaultChecked={skill?.isActive ?? true}
          />
          {tr("Active")}
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {tr(busy ? "Applying…" : "Save skill")}
        </button>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Attendance

type AttendanceItem = {
  id: string;
  job: { id: string; title: string; status: string };
  worker: Person;
  startsAt: string | null;
  endsAt: string | null;
  checkinAt: string | null;
  checkoutAt: string | null;
  overriddenAt: string | null;
  overrideReason: string | null;
};

/** Confirmed assignments with check-in state, and the two overrides. */
export function Attendance() {
  const [state, setState] = useState("needs-checkin");
  const [search, setSearch] = useState("");
  const list = usePagedData<AttendanceItem>("attendance", { state, search });
  const [pending, setPending] = useState<{
    item: AttendanceItem;
    kind: "checkin" | "checkout";
  } | null>(null);
  return (
    <>
      <p className="muted">
        {tr(
          "Overrides record a check-in or check-out for the worker when the app could not, for example with no GPS on site. Each one is audited with your reason.",
        )}
      </p>
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search job title"
      >
        <FilterSelect
          label="Show"
          value={state}
          options={[
            ["needs-checkin", "Started, no check-in"],
            ["needs-checkout", "Ended, no check-out"],
            ["all", "All live assignments"],
          ]}
          onChange={setState}
        />
      </ListToolbar>
      <State loading={list.loading} error={list.error}>
        <DataTable
          headers={[
            "Job",
            "Worker",
            "Agreed time",
            "Check-in",
            "Check-out",
            "Action",
          ]}
          empty={!list.items.length}
        >
          {list.items.map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{item.job.title}</strong>
                <Badge value={item.job.status} />
              </td>
              <td>{item.worker.name ?? tr("Unknown")}</td>
              <td>
                {item.startsAt ? formatDate(item.startsAt) : "—"}
                <small>{item.endsAt ? formatDate(item.endsAt) : ""}</small>
              </td>
              <td>
                {item.checkinAt ? formatDate(item.checkinAt) : tr("Not yet")}
                {item.overriddenAt && (
                  <small>
                    {tr("Override")}: {item.overrideReason}
                  </small>
                )}
              </td>
              <td>
                {item.checkoutAt ? formatDate(item.checkoutAt) : tr("Not yet")}
              </td>
              <td className="actions">
                {!item.checkinAt && (
                  <Can route="POST assignments/:id/checkin-override">
                    <button
                      onClick={() => setPending({ item, kind: "checkin" })}
                    >
                      {tr("Record check-in")}
                    </button>
                  </Can>
                )}
                {item.checkinAt && !item.checkoutAt && (
                  <Can route="POST assignments/:id/checkout-override">
                    <button
                      onClick={() => setPending({ item, kind: "checkout" })}
                    >
                      {tr("Record check-out")}
                    </button>
                  </Can>
                )}
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
      {pending && (
        <ReasonDialog
          title={`${pending.kind === "checkin" ? "Record check-in" : "Record check-out"}: ${pending.item.job.title}`}
          confirmLabel={
            pending.kind === "checkin" ? "Record check-in" : "Record check-out"
          }
          onClose={() => setPending(null)}
          onConfirm={async (reason) => {
            if (reason.trim().length < 10)
              throw new Error(tr("Give at least 10 characters."));
            await adminApi(
              `assignments/${pending.item.id}/${pending.kind}-override`,
              {
                ...json("POST", { reason }),
                headers: { "idempotency-key": crypto.randomUUID() },
              },
            );
            setPending(null);
            await list.reload();
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------- Businesses

type BusinessItem = {
  id: string;
  name: string;
  owner: Person;
  stage: string;
  verificationStatus: string;
  isPublic: boolean;
  location: { nameEn: string; nameBn: string } | null;
  offerings: number;
  hidden: boolean;
  hiddenReason: string | null;
  createdAt: string;
};

export function Businesses() {
  const [state, setState] = useState("all");
  const [search, setSearch] = useState("");
  const list = usePagedData<BusinessItem>("businesses", { state, search });
  const action = useContentAction(list.reload);
  return (
    <>
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search name or licence"
      >
        <FilterSelect
          label="Show"
          value={state}
          options={VISIBILITY}
          onChange={setState}
        />
      </ListToolbar>
      <State loading={list.loading} error={list.error}>
        <DataTable
          headers={[
            "Business",
            "Owner",
            "Verification",
            "Offerings",
            "State",
            "Action",
          ]}
          empty={!list.items.length}
        >
          {list.items.map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{item.name}</strong>
                <small>
                  {humanize(item.stage)}
                  {item.location
                    ? ` · ${localizedEntityName(item.location.nameEn, item.location.nameBn)}`
                    : ""}
                </small>
              </td>
              <td>{item.owner.name ?? tr("Unknown")}</td>
              <td>
                <Badge value={item.verificationStatus} />
              </td>
              <td>{item.offerings}</td>
              <td>
                <Badge
                  value={
                    item.hidden
                      ? "SUSPENDED"
                      : item.isPublic
                        ? "PUBLIC"
                        : "PRIVATE"
                  }
                />
                {item.hiddenReason && <small>{item.hiddenReason}</small>}
              </td>
              <td className="actions">
                <HideButton
                  hidden={item.hidden}
                  onClick={() =>
                    action.open({
                      type: "BUSINESS",
                      id: item.id,
                      title: item.name,
                      hidden: item.hidden,
                    })
                  }
                />
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
      {action.dialog}
    </>
  );
}

// ---------------------------------------------------------------- Ideas

type IdeaItem = {
  id: string;
  title: string;
  summary: string;
  owner: Person;
  stage: string;
  visibility: string;
  hidden: boolean;
  hiddenReason: string | null;
  createdAt: string;
};

export function Ideas() {
  const [state, setState] = useState("all");
  const [search, setSearch] = useState("");
  const list = usePagedData<IdeaItem>("ideas", { state, search });
  const action = useContentAction(list.reload);
  return (
    <>
      <p className="muted">
        {tr(
          "Shared and public ideas only. Private ideas stay private; they reach staff only through a safety report.",
        )}
      </p>
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search ideas"
      >
        <FilterSelect
          label="Show"
          value={state}
          options={VISIBILITY}
          onChange={setState}
        />
      </ListToolbar>
      <State loading={list.loading} error={list.error}>
        <DataTable
          headers={["Idea", "Owner", "Stage", "Visibility", "Action"]}
          empty={!list.items.length}
        >
          {list.items.map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{item.title}</strong>
                <small>{item.summary}</small>
              </td>
              <td>{item.owner.name ?? tr("Unknown")}</td>
              <td>{humanize(item.stage)}</td>
              <td>
                <Badge value={item.hidden ? "HIDDEN" : item.visibility} />
                {item.hiddenReason && <small>{item.hiddenReason}</small>}
              </td>
              <td className="actions">
                <HideButton
                  hidden={item.hidden}
                  onClick={() =>
                    action.open({
                      type: "IDEA",
                      id: item.id,
                      title: item.title,
                      hidden: item.hidden,
                    })
                  }
                />
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
      {action.dialog}
    </>
  );
}

// ---------------------------------------------------------------- Introductions

type IntroductionItem = {
  id: string;
  requester: Person & { sentLast7Days: number };
  target: Person;
  contextType: string;
  contextSummary: string;
  status: string;
  hidden: boolean;
  expiresAt: string;
  createdAt: string;
};

export function Introductions() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const list = usePagedData<IntroductionItem>("introductions", {
    status,
    search,
  });
  const action = useContentAction(list.reload);
  return (
    <>
      <p className="muted">
        {tr(
          "Messages are not shown. A high weekly count from one sender can mean unwanted contact.",
        )}
      </p>
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search people"
      >
        <FilterSelect
          label="Status"
          value={status}
          options={[
            ["", "All"],
            ["PENDING", "Pending"],
            ["ACCEPTED", "Accepted"],
            ["DECLINED", "Declined"],
            ["EXPIRED", "Expired"],
            ["WITHDRAWN", "Withdrawn"],
          ]}
          onChange={setStatus}
        />
      </ListToolbar>
      <State loading={list.loading} error={list.error}>
        <DataTable
          headers={["From", "To", "About", "Status", "Sent", "Action"]}
          empty={!list.items.length}
        >
          {list.items.map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{item.requester.name ?? tr("Unknown")}</strong>
                <small>
                  {item.requester.sentLast7Days} {tr("sent in 7 days")}
                </small>
              </td>
              <td>{item.target.name ?? tr("Unknown")}</td>
              <td>
                {humanize(item.contextType)}
                <small>{item.contextSummary}</small>
              </td>
              <td>
                <Badge value={item.hidden ? "HIDDEN" : item.status} />
              </td>
              <td>{formatDate(item.createdAt)}</td>
              <td className="actions">
                <HideButton
                  hidden={item.hidden}
                  onClick={() =>
                    action.open({
                      type: "INTRODUCTION",
                      id: item.id,
                      title: `${item.requester.name ?? ""} → ${item.target.name ?? ""}`,
                      hidden: item.hidden,
                    })
                  }
                />
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
      {action.dialog}
    </>
  );
}

// ---------------------------------------------------------------- Mentors

type MentorItem = {
  id: string;
  userId: string;
  name: string;
  status: string;
  accepting: boolean;
  yearsExperience: number | null;
  appliedAt: string | null;
  approvedAt: string | null;
  opportunities: number;
};

/** Every mentor, so one without an opportunity can still be suspended. */
export function Mentors() {
  const [status, setStatus] = useState("APPROVED");
  const [search, setSearch] = useState("");
  const list = usePagedData<MentorItem>("mentors", { status, search });
  const [pending, setPending] = useState<{
    item: MentorItem;
    kind: "suspend" | "reinstate";
  } | null>(null);
  return (
    <>
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search mentors"
      >
        <FilterSelect
          label="Status"
          value={status}
          options={[
            ["APPROVED", "Approved"],
            ["SUSPENDED", "Suspended"],
            ["PENDING", "Pending"],
            ["REJECTED", "Rejected"],
            ["", "All"],
          ]}
          onChange={setStatus}
        />
      </ListToolbar>
      <State loading={list.loading} error={list.error}>
        <DataTable
          headers={[
            "Mentor",
            "Status",
            "Experience",
            "Opportunities",
            "Action",
          ]}
          empty={!list.items.length}
        >
          {list.items.map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{item.name}</strong>
                <small>
                  {item.approvedAt
                    ? `${tr("Approved")} ${formatDate(item.approvedAt)}`
                    : item.appliedAt
                      ? `${tr("Applied")} ${formatDate(item.appliedAt)}`
                      : ""}
                </small>
              </td>
              <td>
                <Badge value={item.status} />
                {item.status === "APPROVED" && (
                  <small>
                    {tr(
                      item.accepting
                        ? "Taking learners"
                        : "Not taking learners",
                    )}
                  </small>
                )}
              </td>
              <td>
                {item.yearsExperience ?? 0} {tr("years")}
              </td>
              <td>{item.opportunities}</td>
              <td className="actions">
                {item.status === "APPROVED" && (
                  <Can route="POST mentors/:userId/suspend">
                    <button
                      onClick={() => setPending({ item, kind: "suspend" })}
                    >
                      {tr("Suspend mentor")}
                    </button>
                  </Can>
                )}
                {item.status === "SUSPENDED" && (
                  <Can route="POST mentors/:userId/reinstate">
                    <button
                      onClick={() => setPending({ item, kind: "reinstate" })}
                    >
                      {tr("Reinstate mentor")}
                    </button>
                  </Can>
                )}
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
      {pending && (
        <ReasonDialog
          title={`${pending.kind === "suspend" ? "Suspend mentor" : "Reinstate mentor"}: ${pending.item.name}`}
          confirmLabel={
            pending.kind === "suspend" ? "Suspend mentor" : "Reinstate mentor"
          }
          onClose={() => setPending(null)}
          onConfirm={async (reason) => {
            await adminApi(
              `mentors/${pending.item.userId}/${pending.kind}`,
              json("POST", { reason }),
            );
            setPending(null);
            await list.reload();
          }}
        />
      )}
    </>
  );
}
