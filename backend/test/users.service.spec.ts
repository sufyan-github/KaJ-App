import { RoleMode } from "@prisma/client";

import { PrismaService } from "../src/infra/prisma/prisma.service";
import { AuthTokenService } from "../src/modules/auth/auth-token.service";
import { UsersService } from "../src/modules/users/users.service";

describe("UsersService role activation", () => {
  const userFindUnique = jest.fn();
  const userUpdate = jest.fn();
  const profileUpsert = jest.fn();
  const workerUpsert = jest.fn();
  const customerUpsert = jest.fn();
  const transaction = {
    user: { findUnique: userFindUnique, update: userUpdate },
    profile: { upsert: profileUpsert },
    workerProfile: { upsert: workerUpsert },
    customerProfile: { upsert: customerUpsert },
  };
  const prisma = {
    $transaction: jest.fn((callback) => callback(transaction)),
  } as unknown as PrismaService;
  const service = new UsersService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    userFindUnique.mockResolvedValue({
      default_locale: "bn",
      profile: null,
      role_modes: [RoleMode.CUSTOMER],
    });
    userUpdate.mockResolvedValue({});
    profileUpsert.mockResolvedValue({});
    workerUpsert.mockResolvedValue({});
    customerUpsert.mockResolvedValue({});
  });

  it("activates worker mode while preserving customer mode", async () => {
    const result = await service.activateRole("user-id", RoleMode.WORKER);

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "user-id" },
      data: {
        active_role: RoleMode.WORKER,
        role_modes: [RoleMode.CUSTOMER, RoleMode.WORKER],
      },
    });
    expect(workerUpsert).toHaveBeenCalled();
    expect(customerUpsert).not.toHaveBeenCalled();
    expect(result).toEqual({
      activeRole: RoleMode.WORKER,
      roles: [RoleMode.CUSTOMER, RoleMode.WORKER],
      home: "worker",
      onboardingRequired: true,
    });
  });

  it("does not duplicate an already active customer mode", async () => {
    await service.activateRole("user-id", RoleMode.CUSTOMER);

    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role_modes: [RoleMode.CUSTOMER] }),
      }),
    );
    expect(customerUpsert).toHaveBeenCalled();
  });

  it("issues a fresh access token containing a newly activated role", async () => {
    const createAccessToken = jest.fn().mockResolvedValue("fresh-access-token");
    const prismaWithUser = {
      ...prisma,
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "user-id",
          phone_e164: "+8801700000301",
          status: "ACTIVE",
          role_modes: [RoleMode.CUSTOMER, RoleMode.WORKER],
          active_role: RoleMode.WORKER,
          is_admin: false,
        }),
      },
    } as unknown as PrismaService;
    const tokens = { createAccessToken } as unknown as AuthTokenService;
    const serviceWithTokens = new UsersService(prismaWithUser, tokens);

    const result = await serviceWithTokens.activateRole(
      "user-id",
      RoleMode.WORKER,
      "device-id",
    );

    expect(result).toEqual(
      expect.objectContaining({
        activeRole: RoleMode.WORKER,
        accessToken: "fresh-access-token",
      }),
    );
    expect(createAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: [RoleMode.CUSTOMER, RoleMode.WORKER],
        activeRole: RoleMode.WORKER,
      }),
      "device-id",
    );
  });
});

describe("UsersService account deletion", () => {
  const jobCount = jest.fn();
  const assignmentCount = jest.fn();
  const disputeCount = jest.fn();
  const userUpdate = jest.fn();
  const refreshUpdateMany = jest.fn();
  const deviceUpdateMany = jest.fn();
  const prisma = {
    job: { count: jobCount },
    assignment: { count: assignmentCount },
    dispute: { count: disputeCount },
    user: { update: userUpdate },
    refreshToken: { updateMany: refreshUpdateMany },
    userDevice: { updateMany: deviceUpdateMany },
    $transaction: jest.fn((operations) => Promise.all(operations)),
  } as unknown as PrismaService;
  const service = new UsersService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    jobCount.mockResolvedValue(0);
    assignmentCount.mockResolvedValue(0);
    disputeCount.mockResolvedValue(0);
    userUpdate.mockResolvedValue({});
    refreshUpdateMany.mockResolvedValue({ count: 1 });
    deviceUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("blocks deletion while active work exists", async () => {
    assignmentCount.mockResolvedValue(1);

    await expect(service.requestAccountDeletion("user-id")).rejects.toThrow(
      "Resolve active work",
    );
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("marks the account pending deletion and revokes access", async () => {
    const result = await service.requestAccountDeletion("user-id");

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "user-id" },
      data: {
        status: "PENDING_DELETION",
        deleted_at: expect.any(Date),
      },
    });
    expect(refreshUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: "user-id", revoked_at: null },
      }),
    );
    expect(deviceUpdateMany).toHaveBeenCalledWith({
      where: { user_id: "user-id" },
      data: { fcm_token: null },
    });
    expect(result.status).toBe("PENDING_DELETION");
  });
});
