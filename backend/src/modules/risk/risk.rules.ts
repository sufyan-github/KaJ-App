import { RiskIdentityKind, RiskSeverity } from "@prisma/client";

import { distanceMetres } from "../attendance/geofence";

export const RISK_THRESHOLDS = {
  applicationDayCount: 60,
  applicationHourCount: 20,
  identityAccountCounts: {
    DEVICE: 2,
    PHONE: 2,
    IP: 4,
  } satisfies Record<RiskIdentityKind, number>,
  impossibleTravelDistanceKm: 50,
  impossibleTravelSpeedKph: 180,
  priceBaselineCount: 10,
  priceHighRatio: 5,
  priceLowRatio: 0.2,
  reviewHighRatingRatio: 0.9,
  reviewPairAssignments: 4,
} as const;

export type RiskSignalType =
  | "APPLICATION_SPAM"
  | "DUPLICATE_DEVICE"
  | "DUPLICATE_PHONE"
  | "IMPOSSIBLE_TRAVEL"
  | "IP_CLUSTER"
  | "MOCK_LOCATION"
  | "PRICE_ANOMALY"
  | "REVIEW_RING";

export interface RiskSignal {
  evidence: Record<string, boolean | number | string | string[]>;
  score: number;
  type: RiskSignalType;
}

export interface IdentityObservation {
  kind: RiskIdentityKind;
  lastObservedAt: Date;
  userId: string;
  valueHash: string;
}

export interface AttendancePoint {
  at: Date;
  eventId: string;
  lat: number;
  lng: number;
  mockLocation: boolean;
  userId: string;
}

export interface ApplicationEvent {
  at: Date;
  id: string;
  userId: string;
}

export interface ReviewEvent {
  assignmentId: string;
  at: Date;
  rating: number;
  revieweeUserId: string;
  reviewerUserId: string;
}

export interface PriceEvent {
  amountPoisha: bigint;
  at: Date;
  groupKey: string;
  jobId: string;
  userId: string;
}

export function detectIdentityClusters(
  observations: readonly IdentityObservation[],
): Map<string, RiskSignal[]> {
  const groups = new Map<string, IdentityObservation[]>();
  for (const item of observations) {
    const key = `${item.kind}:${item.valueHash}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const result = new Map<string, RiskSignal[]>();
  for (const [key, items] of groups) {
    const users = [...new Set(items.map((item) => item.userId))].sort();
    const kind = items[0]!.kind;
    if (users.length < RISK_THRESHOLDS.identityAccountCounts[kind]) continue;
    const type = identitySignalType(kind);
    const score = kind === "PHONE" ? 70 : kind === "DEVICE" ? 55 : 25;
    for (const userId of users) {
      addSignal(result, userId, {
        type,
        score,
        evidence: {
          clusterReference: shortReference(key),
          relatedUserIds: users.filter((id) => id !== userId),
          sharedAccountCount: users.length,
        },
      });
    }
  }
  return result;
}

export function detectTravelRisk(
  points: readonly AttendancePoint[],
): Map<string, RiskSignal[]> {
  const result = new Map<string, RiskSignal[]>();
  const byUser = groupBy(points, (point) => point.userId);
  for (const [userId, userPoints] of byUser) {
    const ordered = [...userPoints].sort(
      (a, b) => a.at.getTime() - b.at.getTime(),
    );
    for (const point of ordered) {
      if (point.mockLocation) {
        addSignal(result, userId, {
          type: "MOCK_LOCATION",
          score: 50,
          evidence: { eventId: point.eventId },
        });
      }
    }
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1]!;
      const current = ordered[index]!;
      const elapsedHours =
        (current.at.getTime() - previous.at.getTime()) / 3_600_000;
      if (elapsedHours <= 0) continue;
      const distanceKm = distanceMetres(previous, current) / 1_000;
      const speedKph = distanceKm / elapsedHours;
      if (
        distanceKm < RISK_THRESHOLDS.impossibleTravelDistanceKm ||
        speedKph <= RISK_THRESHOLDS.impossibleTravelSpeedKph
      ) {
        continue;
      }
      addSignal(result, userId, {
        type: "IMPOSSIBLE_TRAVEL",
        score: Math.min(70, 45 + Math.floor((speedKph - 180) / 20)),
        evidence: {
          distanceKm: round(distanceKm),
          elapsedMinutes: Math.round(elapsedHours * 60),
          eventIds: [previous.eventId, current.eventId],
          speedKph: round(speedKph),
        },
      });
    }
  }
  return result;
}

export function detectApplicationSpam(
  events: readonly ApplicationEvent[],
  asOf: Date,
): Map<string, RiskSignal[]> {
  const result = new Map<string, RiskSignal[]>();
  const hourStart = new Date(asOf.getTime() - 3_600_000);
  const dayStart = new Date(asOf.getTime() - 86_400_000);
  for (const [userId, userEvents] of groupBy(events, (event) => event.userId)) {
    const hourCount = userEvents.filter(
      (event) => event.at >= hourStart,
    ).length;
    const dayCount = userEvents.filter((event) => event.at >= dayStart).length;
    if (
      hourCount < RISK_THRESHOLDS.applicationHourCount &&
      dayCount < RISK_THRESHOLDS.applicationDayCount
    ) {
      continue;
    }
    addSignal(result, userId, {
      type: "APPLICATION_SPAM",
      score: hourCount >= 30 || dayCount >= 90 ? 50 : 35,
      evidence: { dayCount, hourCount },
    });
  }
  return result;
}

export function detectReviewRings(
  reviews: readonly ReviewEvent[],
): Map<string, RiskSignal[]> {
  const result = new Map<string, RiskSignal[]>();
  const pairs = groupBy(reviews, (review) =>
    [review.reviewerUserId, review.revieweeUserId].sort().join(":"),
  );
  for (const pairReviews of pairs.values()) {
    const users = [
      ...new Set(
        pairReviews.flatMap((review) => [
          review.reviewerUserId,
          review.revieweeUserId,
        ]),
      ),
    ].sort();
    if (users.length !== 2) continue;
    const assignmentCount = new Set(
      pairReviews.map((review) => review.assignmentId),
    ).size;
    const highRatingRatio =
      pairReviews.filter((review) => review.rating === 5).length /
      pairReviews.length;
    const bothDirections = users.every((userId) =>
      pairReviews.some((review) => review.reviewerUserId === userId),
    );
    if (
      assignmentCount < RISK_THRESHOLDS.reviewPairAssignments ||
      highRatingRatio < RISK_THRESHOLDS.reviewHighRatingRatio ||
      !bothDirections
    ) {
      continue;
    }
    for (const userId of users) {
      addSignal(result, userId, {
        type: "REVIEW_RING",
        score: 40,
        evidence: {
          assignmentCount,
          counterpartyUserId: users.find((id) => id !== userId)!,
          highRatingPercent: Math.round(highRatingRatio * 100),
          reviewCount: pairReviews.length,
        },
      });
    }
  }
  return result;
}

export function detectPriceAnomalies(
  events: readonly PriceEvent[],
  candidateAfter: Date,
): Map<string, RiskSignal[]> {
  const result = new Map<string, RiskSignal[]>();
  for (const [groupKey, group] of groupBy(events, (event) => event.groupKey)) {
    if (group.length < RISK_THRESHOLDS.priceBaselineCount) continue;
    const medianPoisha = median(group.map((event) => event.amountPoisha));
    if (medianPoisha <= 0n) continue;
    for (const event of group) {
      if (event.at < candidateAfter) continue;
      const ratio = Number(event.amountPoisha) / Number(medianPoisha);
      if (
        ratio <= RISK_THRESHOLDS.priceHighRatio &&
        ratio >= RISK_THRESHOLDS.priceLowRatio
      ) {
        continue;
      }
      addSignal(result, event.userId, {
        type: "PRICE_ANOMALY",
        score: 30,
        evidence: {
          amountPoisha: event.amountPoisha.toString(),
          baselineCount: group.length,
          groupKey,
          jobId: event.jobId,
          medianPoisha: medianPoisha.toString(),
          ratio: round(ratio),
        },
      });
    }
  }
  return result;
}

export function mergeSignals(
  ...sets: ReadonlyMap<string, RiskSignal[]>[]
): Map<string, RiskSignal[]> {
  const merged = new Map<string, RiskSignal[]>();
  for (const set of sets) {
    for (const [userId, signals] of set) {
      for (const signal of signals) addSignal(merged, userId, signal);
    }
  }
  return merged;
}

export function totalRiskScore(signals: readonly RiskSignal[]): number {
  return Math.min(
    100,
    signals.reduce((total, signal) => total + signal.score, 0),
  );
}

export function severityForScore(score: number): RiskSeverity {
  if (score >= 85) return RiskSeverity.CRITICAL;
  if (score >= 60) return RiskSeverity.HIGH;
  if (score >= 30) return RiskSeverity.MEDIUM;
  return RiskSeverity.LOW;
}

function addSignal(
  result: Map<string, RiskSignal[]>,
  userId: string,
  signal: RiskSignal,
) {
  result.set(userId, [...(result.get(userId) ?? []), signal]);
}

function groupBy<T>(items: readonly T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const itemKey = key(item);
    groups.set(itemKey, [...(groups.get(itemKey) ?? []), item]);
  }
  return groups;
}

function identitySignalType(kind: RiskIdentityKind): RiskSignalType {
  if (kind === "DEVICE") return "DUPLICATE_DEVICE";
  if (kind === "PHONE") return "DUPLICATE_PHONE";
  return "IP_CLUSTER";
}

function median(values: readonly bigint[]): bigint {
  const ordered = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1
    ? ordered[middle]!
    : (ordered[middle - 1]! + ordered[middle]!) / 2n;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function shortReference(value: string): string {
  return value.slice(0, 16);
}
