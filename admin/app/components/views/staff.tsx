"use client";
import { FormEvent, useState } from "react";
import { adminApi, json } from "@/lib/admin-api";
import { friendlyAdminError, tr } from "@/lib/admin-i18n";
import {
  Badge,
  Can,
  DataTable,
  Dialog,
  ReasonDialog,
  Section,
  State,
  formatDate,
  humanize,
  useData,
} from "../ui";

const STAFF_ROLES = ["ADMIN", "MODERATOR", "SUPPORT", "FINANCE"] as const;

type StaffItem = {
  userId: string;
  email: string | null;
  name: string | null;
  role: string;
  active: boolean;
  userStatus: string;
  createdAt: string;
  lastActiveAt: string | null;
};

type Credentials = {
  temporaryPassword: string;
  totpSecret: string;
  otpauthUri: string;
};

type Pending =
  | { kind: "role"; item: StaffItem; role: string }
  | { kind: "deactivate" | "reactivate"; item: StaffItem };

/** R5 staff management: ADMIN only (the module is hidden for other roles). */
export function Staff({ selfId }: { selfId: string }) {
  const { data, loading, error, reload } = useData<{ items: StaffItem[] }>(
    "staff",
  );
  const [inviting, setInviting] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [issued, setIssued] = useState<{
    email: string;
    credentials: Credentials;
  } | null>(null);
  return (
    <State loading={loading} error={error}>
      <Section
        title="Staff accounts"
        note="Who can sign in to this console, and with which role"
      >
        <div className="toolbar">
          <span className="muted">
            {tr(
              "Deactivating ends every session at once. Your own account is changed by another administrator.",
            )}
          </span>
          <Can route="POST staff">
            <button
              className="primary small-button"
              onClick={() => setInviting(true)}
            >
              {tr("Invite staff")}
            </button>
          </Can>
        </div>
        <DataTable
          headers={["Person", "Role", "State", "Last active", "Actions"]}
          empty={!data?.items.length}
        >
          {(data?.items ?? []).map((item) => (
            <tr key={item.userId}>
              <td>
                <strong>{item.name ?? item.email}</strong>
                <small>{item.email}</small>
              </td>
              <td>
                {item.userId === selfId ? (
                  <>
                    {humanize(item.role)} <small>{tr("You")}</small>
                  </>
                ) : (
                  <Can route="PUT staff/:userId/role">
                    <select
                      aria-label={`${tr("Role for")} ${item.email ?? ""}`}
                      value={item.role}
                      disabled={!item.active}
                      onChange={(event) =>
                        setPending({
                          kind: "role",
                          item,
                          role: event.target.value,
                        })
                      }
                    >
                      {STAFF_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {humanize(role)}
                        </option>
                      ))}
                    </select>
                  </Can>
                )}
              </td>
              <td>
                <Badge value={item.active ? "ACTIVE" : "DEACTIVATED"} />
                {item.userStatus !== "ACTIVE" && (
                  <small>
                    {tr("User account")} {humanize(item.userStatus)}
                  </small>
                )}
              </td>
              <td>
                {item.lastActiveAt
                  ? formatDate(item.lastActiveAt)
                  : tr("Never")}
              </td>
              <td className="actions">
                {item.userId !== selfId &&
                  (item.active ? (
                    <Can route="POST staff/:userId/deactivate">
                      <button
                        onClick={() => setPending({ kind: "deactivate", item })}
                      >
                        {tr("Deactivate")}
                      </button>
                    </Can>
                  ) : (
                    <Can route="POST staff/:userId/reactivate">
                      <button
                        onClick={() => setPending({ kind: "reactivate", item })}
                      >
                        {tr("Reactivate")}
                      </button>
                    </Can>
                  ))}
              </td>
            </tr>
          ))}
        </DataTable>
      </Section>
      {inviting && (
        <InviteDialog
          onClose={() => setInviting(false)}
          onDone={async (email, credentials) => {
            setInviting(false);
            setIssued({ email, credentials });
            await reload();
          }}
        />
      )}
      {pending && (
        <ReasonDialog
          title={
            pending.kind === "role"
              ? `Change ${pending.item.email} to ${humanize(pending.role)}`
              : pending.kind === "deactivate"
                ? `Deactivate ${pending.item.email}`
                : `Reactivate ${pending.item.email} with new sign-in details`
          }
          confirmLabel={
            pending.kind === "role"
              ? "Change role"
              : pending.kind === "deactivate"
                ? "Deactivate and sign out"
                : "Reactivate"
          }
          onClose={() => setPending(null)}
          onConfirm={async (reason) => {
            const path = `staff/${pending.item.userId}`;
            if (pending.kind === "role")
              await adminApi(
                `${path}/role`,
                json("PUT", { role: pending.role, reason }),
              );
            else if (pending.kind === "deactivate")
              await adminApi(`${path}/deactivate`, json("POST", { reason }));
            else {
              const result = await adminApi<{ credentials: Credentials }>(
                `${path}/reactivate`,
                json("POST", { reason }),
              );
              setIssued({
                email: pending.item.email ?? "",
                credentials: result.credentials,
              });
            }
            setPending(null);
            await reload();
          }}
        />
      )}
      {issued && (
        <Dialog
          title="One-time sign-in details"
          onClose={() => setIssued(null)}
        >
          <p className="error">
            {tr(
              "Shown once and not stored. Hand them over in person; the authenticator is set up from the secret or link below.",
            )}
          </p>
          <dl className="credentials">
            <dt>{tr("Email")}</dt>
            <dd>{issued.email}</dd>
            <dt>{tr("Temporary password")}</dt>
            <dd>
              <code>{issued.credentials.temporaryPassword}</code>
            </dd>
            <dt>{tr("Authenticator secret")}</dt>
            <dd>
              <code>{issued.credentials.totpSecret}</code>
            </dd>
            <dt>{tr("Authenticator link")}</dt>
            <dd>
              <code>{issued.credentials.otpauthUri}</code>
            </dd>
          </dl>
          <button className="primary" onClick={() => setIssued(null)}>
            {tr("I have handed these over")}
          </button>
        </Dialog>
      )}
    </State>
  );
}

function InviteDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (email: string, credentials: Credentials) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const email = String(form.get("email")).trim().toLowerCase();
      const result = await adminApi<{ credentials: Credentials }>(
        "staff",
        json("POST", {
          email,
          displayName: String(form.get("displayName")),
          role: String(form.get("role")),
          reason: String(form.get("reason")),
        }),
      );
      await onDone(email, result.credentials);
    } catch (caught) {
      setError(friendlyAdminError(caught));
      setBusy(false);
    }
  }
  return (
    <Dialog title="Invite staff" onClose={onClose}>
      <form onSubmit={submit}>
        <label>
          {tr("Email address")}
          <input name="email" type="email" required autoFocus />
        </label>
        <label>
          {tr("Name")}
          <input name="displayName" minLength={2} maxLength={80} required />
        </label>
        <label>
          {tr("Role")}
          <select name="role" defaultValue="SUPPORT">
            {STAFF_ROLES.map((role) => (
              <option key={role} value={role}>
                {humanize(role)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr("Required operational reason")}
          <textarea name="reason" minLength={8} required />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {tr(busy ? "Applying…" : "Invite and show sign-in details")}
        </button>
      </form>
    </Dialog>
  );
}
