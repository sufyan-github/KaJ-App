import { TrustLevel, UserStatus, VerificationStatus } from "@prisma/client";

import { Clock } from "../src/common/time/clock";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { StoragePort } from "../src/infra/storage/storage.port";
import { VerificationService } from "../src/modules/verification/verification.service";

describe("VerificationService application eligibility", () => {
  const storage = {} as StoragePort;
  const clock = { now: () => new Date() } satisfies Clock;

  it("reports NID and selfie as required while expertise stays optional", async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          status: UserStatus.ACTIVE,
          reverification_required: false,
          reverification_requested_at: null,
          profile: { trust_level: TrustLevel.PHONE },
          verification_requests: [
            {
              status: VerificationStatus.PENDING,
              created_at: new Date("2026-09-05T00:00:00Z"),
            },
          ],
        }),
      },
    } as unknown as PrismaService;
    const service = new VerificationService(prisma, storage, clock);

    const result = await service.applicationEligibility("worker-id");

    expect(result).toMatchObject({
      canApply: false,
      identityStatus: VerificationStatus.PENDING,
      requirements: {
        phone: { required: true, verified: true },
        identityInformation: { required: true, verified: false },
        nid: { required: true, verified: false },
        selfie: { required: true, verified: false },
      },
      optional: { experience: true, expertise: true },
    });
  });

  it("allows applying after approved identity trust", async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          status: UserStatus.ACTIVE,
          reverification_required: false,
          reverification_requested_at: null,
          profile: { trust_level: TrustLevel.IDENTITY },
          verification_requests: [],
        }),
      },
    } as unknown as PrismaService;
    const service = new VerificationService(prisma, storage, clock);

    const result = await service.applicationEligibility("worker-id");

    expect(result.canApply).toBe(true);
    expect(result.identityStatus).toBe(VerificationStatus.APPROVED);
    expect(result.requirements.nid.verified).toBe(true);
    expect(result.requirements.selfie.verified).toBe(true);
  });
});
