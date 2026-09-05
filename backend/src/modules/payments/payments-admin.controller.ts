import { Controller, Get, UseGuards } from "@nestjs/common";
import { AdminRole } from "@prisma/client";

import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AdminRoles } from "../admin-auth/admin-auth.decorators";
import { AdminSessionGuard } from "../admin-auth/admin-session.guard";
import { PaymentsService } from "./payments.service";

@Controller("admin/job-payments")
@UseGuards(AdminSessionGuard)
export class PaymentsAdminController {
  constructor(private readonly payments: PaymentsService) {}

  @Get("overview")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.FINANCE, AdminRole.SUPPORT)
  async overview() {
    return this.payments.adminOverview();
  }
}
