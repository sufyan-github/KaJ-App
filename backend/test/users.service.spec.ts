import { RoleMode } from "@prisma/client";

import { PrismaService } from "../src/infra/prisma/prisma.service";
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
});
