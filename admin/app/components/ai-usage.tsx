"use client";
import { useCallback, useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { friendlyAdminError, getActiveAdminLocale, tr } from "@/lib/admin-i18n";

type Feature =
  "IDEA_ANALYSIS" | "OPPORTUNITY_SUGGESTIONS" | "BUSINESS_GROWTH_TIPS";
type Usage = {
  window: { days: number; since: string };
  settings: {
    enabled: boolean;
    model: string;
    globalDailyLimit: number;
    globalUsedToday: number | null;
    resetsAt: string;
    perUserDailyLimits: Record<Feature, number>;
  };
  totals: {
    calls: number;
    costUsdMicros: number;
    refused: number;
    invalidOutput: number;
    errors: number;
    modelFallbacks: number;
  };
  daily: Array<{
    day: string;
    feature: Feature;
    calls: number;
    costUsdMicros: number;
    inputTokens: number;
    outputTokens: number;
    refused: number;
    invalidOutput: number;
    errors: number;
    modelFallbacks: number;
  }>;
  topUsers: Array<{
    userId: string;
    name: string | null;
    calls: number;
    costUsdMicros: number;
    refused: number;
  }>;
};

const FEATURES: Array<[Feature, string]> = [
  ["IDEA_ANALYSIS", "Idea analysis"],
  ["OPPORTUNITY_SUGGESTIONS", "Opportunity suggestions"],
  ["BUSINESS_GROWTH_TIPS", "Growth tips"],
];

const locale = () => (getActiveAdminLocale() === "bn" ? "bn-BD" : "en-BD");
const count = (value: number) => new Intl.NumberFormat(locale()).format(value);
/** Estimated cost; the log stores millionths of a US dollar. */
const usd = (micros: number) =>
  new Intl.NumberFormat(locale(), {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: micros < 10_000_000 ? 4 : 2,
  }).format(micros / 1_000_000);

/** ADMIN only: P4 AI calls, estimated cost, outcomes and the daily caps. */
export function AiUsage() {
  const [days, setDays] = useState(14);
  const [data, setData] = useState<Usage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await adminApi<Usage>(`ai/usage?days=${days}`));
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [days]);
  useEffect(() => void load(), [load]);

  if (loading)
    return <div className="panel-state">{tr("Loading secure data…")}</div>;
  if (error || !data)
    return (
      <div className="panel-state error" role="alert">
        {error}
      </div>
    );

  const { settings, totals } = data;
  const dayList = [...new Set(data.daily.map((row) => row.day))];
  const cell = (day: string, feature: Feature) =>
    data.daily.find((row) => row.day === day && row.feature === feature);
  const capShare =
    settings.globalUsedToday === null
      ? null
      : Math.min(
          100,
          (settings.globalUsedToday / settings.globalDailyLimit) * 100,
        );

  return (
    <>
      <div className="toolbar">
        <label>
          {tr("Period")}{" "}
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            {[7, 14, 30, 90].map((value) => (
              <option key={value} value={value}>
                {tr(`Last ${value} days`)}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => void load()}>{tr("Refresh")}</button>
      </div>
      <div className="metric-grid">
        <article>
          <span>{tr("Calls")}</span>
          <strong>{count(totals.calls)}</strong>
        </article>
        <article>
          <span>{tr("Estimated cost")}</span>
          <strong>{usd(totals.costUsdMicros)}</strong>
        </article>
        <article>
          <span>{tr("Refused")}</span>
          <strong>{count(totals.refused)}</strong>
        </article>
        <article>
          <span>{tr("Invalid answers")}</span>
          <strong>{count(totals.invalidOutput)}</strong>
        </article>
        <article>
          <span>{tr("Provider errors")}</span>
          <strong>{count(totals.errors)}</strong>
        </article>
        <article>
          <span>{tr("Fallback model answered")}</span>
          <strong>{count(totals.modelFallbacks)}</strong>
        </article>
      </div>

      <section className="data-section" aria-label={tr("Daily cap")}>
        <div className="section-title">
          <div>
            <h2>{tr("Global daily cap")}</h2>
            <p>
              {tr(settings.enabled ? "AI is on" : "AI is off")} ·{" "}
              {settings.model} · {tr("resets")}{" "}
              {new Intl.DateTimeFormat(locale(), {
                timeStyle: "short",
                dateStyle: "medium",
              }).format(new Date(settings.resetsAt))}
            </p>
          </div>
        </div>
        <p>
          <strong>
            {settings.globalUsedToday === null
              ? tr("Today's count is unavailable (Redis)")
              : `${count(settings.globalUsedToday)} / ${count(settings.globalDailyLimit)}`}
          </strong>{" "}
          {tr("calls today across all users")}
        </p>
        {capShare !== null && (
          <div
            className="cap-meter"
            role="meter"
            aria-label={tr("Share of the global daily cap used")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(capShare)}
          >
            <span style={{ width: `${capShare}%` }} />
          </div>
        )}
        <p className="muted">
          {tr("Per-user daily limits")}:{" "}
          {FEATURES.map(
            ([key, label]) =>
              `${tr(label)} ${count(settings.perUserDailyLimits[key] ?? 0)}`,
          ).join(" · ")}
        </p>
      </section>

      <section className="data-section">
        <div className="section-title">
          <div>
            <h2>{tr("Daily calls and cost by feature")}</h2>
            <p>{tr("Asia/Dhaka days; cost is estimated from list prices")}</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{tr("Day")}</th>
                {FEATURES.map(([key, label]) => (
                  <th key={key}>{tr(label)}</th>
                ))}
                <th>{tr("Refused / invalid / errors")}</th>
              </tr>
            </thead>
            <tbody>
              {dayList.length === 0 && (
                <tr>
                  <td colSpan={FEATURES.length + 2}>
                    {tr("No AI calls in this period")}
                  </td>
                </tr>
              )}
              {dayList.map((day) => {
                const rows = data.daily.filter((row) => row.day === day);
                const sum = (key: "refused" | "invalidOutput" | "errors") =>
                  rows.reduce((total, row) => total + row[key], 0);
                return (
                  <tr key={day}>
                    <td>
                      <strong>{day}</strong>
                    </td>
                    {FEATURES.map(([key]) => {
                      const row = cell(day, key);
                      return (
                        <td key={key}>
                          {row ? (
                            <>
                              {count(row.calls)}
                              <small>{usd(row.costUsdMicros)}</small>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                      );
                    })}
                    <td>
                      {count(sum("refused"))} / {count(sum("invalidOutput"))} /{" "}
                      {count(sum("errors"))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="data-section">
        <div className="section-title">
          <div>
            <h2>{tr("Top users by calls")}</h2>
            <p>{tr("The ten heaviest users in this period")}</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{tr("Person")}</th>
                <th>{tr("Calls")}</th>
                <th>{tr("Estimated cost")}</th>
                <th>{tr("Refused")}</th>
              </tr>
            </thead>
            <tbody>
              {data.topUsers.length === 0 && (
                <tr>
                  <td colSpan={4}>{tr("No AI calls in this period")}</td>
                </tr>
              )}
              {data.topUsers.map((user) => (
                <tr key={user.userId}>
                  <td>
                    <strong>{user.name ?? tr("Profile incomplete")}</strong>
                    <small>{user.userId}</small>
                  </td>
                  <td>{count(user.calls)}</td>
                  <td>{usd(user.costUsdMicros)}</td>
                  <td>{count(user.refused)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
