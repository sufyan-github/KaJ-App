import { RiskIdentityKind, RiskSeverity } from "@prisma/client";

import {
  ApplicationEvent,
  AttendancePoint,
  detectApplicationSpam,
  detectIdentityClusters,
  detectPriceAnomalies,
  detectReviewRings,
  detectTravelRisk,
  PriceEvent,
  ReviewEvent,
  severityForScore,
  totalRiskScore,
} from "../src/modules/risk/risk.rules";

const now = new Date("2026-09-05T10:00:00Z");

describe("risk rules with labelled fixtures", () => {
  const labelled: Array<{
    detected: boolean;
    expectedFraud: boolean;
    name: string;
  }> = [];

  function label(name: string, expectedFraud: boolean, detected: boolean) {
    labelled.push({ name, expectedFraud, detected });
  }

  it("detects shared device and phone identifiers but tolerates household IPs below threshold", () => {
    const sharedDevice = detectIdentityClusters([
      observation("a", RiskIdentityKind.DEVICE, "device-hash"),
      observation("b", RiskIdentityKind.DEVICE, "device-hash"),
    ]);
    const sharedPhone = detectIdentityClusters([
      observation("a", RiskIdentityKind.PHONE, "phone-hash"),
      observation("b", RiskIdentityKind.PHONE, "phone-hash"),
    ]);
    const householdIp = detectIdentityClusters([
      observation("a", RiskIdentityKind.IP, "ip-hash"),
      observation("b", RiskIdentityKind.IP, "ip-hash"),
      observation("c", RiskIdentityKind.IP, "ip-hash"),
    ]);
    label("shared device", true, sharedDevice.has("a"));
    label("shared phone", true, sharedPhone.has("a"));
    label("three-person household IP", false, householdIp.has("a"));
    expect(sharedDevice.get("a")?.[0]?.type).toBe("DUPLICATE_DEVICE");
    expect(sharedPhone.get("a")?.[0]?.type).toBe("DUPLICATE_PHONE");
    expect(householdIp.size).toBe(0);
  });

  it("detects impossible travel and client-reported mock locations without flagging plausible travel", () => {
    const impossible = detectTravelRisk([
      point("a", "one", 24.3745, 88.6042, minutesBefore(30)),
      point("a", "two", 23.8103, 90.4125, now),
    ]);
    const plausible = detectTravelRisk([
      point("b", "three", 24.3745, 88.6042, minutesBefore(120)),
      point("b", "four", 24.3636, 88.6241, now),
    ]);
    const mock = detectTravelRisk([
      { ...point("c", "five", 24.3745, 88.6042, now), mockLocation: true },
    ]);
    label("Rajshahi to Dhaka in 30 minutes", true, impossible.has("a"));
    label("local travel in two hours", false, plausible.has("b"));
    label("reported mock location", true, mock.has("c"));
    expect(impossible.get("a")?.[0]?.type).toBe("IMPOSSIBLE_TRAVEL");
    expect(mock.get("c")?.[0]?.type).toBe("MOCK_LOCATION");
  });

  it("detects application bursts while leaving normal application activity alone", () => {
    const burst = detectApplicationSpam(applications("a", 20, 30), now);
    const normal = detectApplicationSpam(applications("b", 8, 90), now);
    label("20 applications in 30 minutes", true, burst.has("a"));
    label("eight applications in 90 minutes", false, normal.has("b"));
    expect(burst.get("a")?.[0]?.type).toBe("APPLICATION_SPAM");
    expect(normal.size).toBe(0);
  });

  it("detects repeated reciprocal perfect-review loops only at the conservative threshold", () => {
    const ring = detectReviewRings(reciprocalReviews("a", "b", 4));
    const repeatHire = detectReviewRings(reciprocalReviews("c", "d", 3));
    label("four reciprocal perfect assignments", true, ring.has("a"));
    label("three legitimate repeat assignments", false, repeatHire.has("c"));
    expect(ring.get("a")?.[0]?.type).toBe("REVIEW_RING");
    expect(repeatHire.size).toBe(0);
  });

  it("uses a ten-item category baseline before detecting price anomalies", () => {
    const baseline = prices("normal", 10, 100_000n, 30);
    const anomaly = detectPriceAnomalies(
      [...baseline, price("suspicious", "outlier", 800_000n, 1)],
      daysBefore(7),
    );
    const ordinary = detectPriceAnomalies(
      [...baseline, price("ordinary", "ordinary", 180_000n, 1)],
      daysBefore(7),
    );
    const insufficient = detectPriceAnomalies(
      [...prices("small", 8, 100_000n, 30), price("new", "new", 900_000n, 1)],
      daysBefore(7),
    );
    label("eight-times category price", true, anomaly.has("suspicious"));
    label("ordinary category variation", false, ordinary.has("ordinary"));
    label("insufficient baseline", false, insufficient.has("new"));
    expect(anomaly.get("suspicious")?.[0]?.type).toBe("PRICE_ANOMALY");
    expect(ordinary.size).toBe(0);
    expect(insufficient.size).toBe(0);
  });

  it("reports fixture precision and false-positive rate", () => {
    expect(labelled).toHaveLength(13);
    const truePositive = labelled.filter(
      (item) => item.expectedFraud && item.detected,
    ).length;
    const falsePositive = labelled.filter(
      (item) => !item.expectedFraud && item.detected,
    ).length;
    const trueNegative = labelled.filter(
      (item) => !item.expectedFraud && !item.detected,
    ).length;
    const precision = truePositive / (truePositive + falsePositive);
    const falsePositiveRate = falsePositive / (falsePositive + trueNegative);
    expect({ precision, falsePositiveRate }).toEqual({
      precision: 1,
      falsePositiveRate: 0,
    });
  });

  it("caps aggregate scores and maps severity deterministically", () => {
    expect(
      totalRiskScore([
        { type: "DUPLICATE_PHONE", score: 70, evidence: {} },
        { type: "APPLICATION_SPAM", score: 50, evidence: {} },
      ]),
    ).toBe(100);
    expect(severityForScore(29)).toBe(RiskSeverity.LOW);
    expect(severityForScore(30)).toBe(RiskSeverity.MEDIUM);
    expect(severityForScore(60)).toBe(RiskSeverity.HIGH);
    expect(severityForScore(85)).toBe(RiskSeverity.CRITICAL);
  });
});

function observation(
  userId: string,
  kind: RiskIdentityKind,
  valueHash: string,
) {
  return { userId, kind, valueHash, lastObservedAt: now };
}

function point(
  userId: string,
  eventId: string,
  lat: number,
  lng: number,
  at: Date,
): AttendancePoint {
  return { userId, eventId, lat, lng, at, mockLocation: false };
}

function applications(
  userId: string,
  count: number,
  minutes: number,
): ApplicationEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    userId,
    id: `${userId}-${index}`,
    at: new Date(now.getTime() - (minutes * index * 60_000) / count),
  }));
}

function reciprocalReviews(
  first: string,
  second: string,
  assignments: number,
): ReviewEvent[] {
  return Array.from({ length: assignments }, (_, index) => {
    const assignmentId = `assignment-${first}-${index}`;
    return [
      {
        assignmentId,
        reviewerUserId: first,
        revieweeUserId: second,
        rating: 5,
        at: now,
      },
      {
        assignmentId,
        reviewerUserId: second,
        revieweeUserId: first,
        rating: 5,
        at: now,
      },
    ];
  }).flat();
}

function prices(
  prefix: string,
  count: number,
  amount: bigint,
  days: number,
): PriceEvent[] {
  return Array.from({ length: count }, (_, index) =>
    price(`${prefix}-${index}`, `${prefix}-${index}`, amount, days),
  );
}

function price(
  userId: string,
  jobId: string,
  amountPoisha: bigint,
  days: number,
): PriceEvent {
  return {
    userId,
    jobId,
    amountPoisha,
    groupKey: "category:fixed",
    at: daysBefore(days),
  };
}

function minutesBefore(minutes: number): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

function daysBefore(days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}
