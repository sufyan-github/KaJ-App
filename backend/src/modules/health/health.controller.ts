import {
  Controller,
  Get,
  Header,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";

import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { ReadinessService } from "./readiness.service";

class HealthResponse {
  status!: "ok";
}

@ApiTags("operations")
@Controller()
export class HealthController {
  constructor(private readonly readiness: ReadinessService) {}

  @Get("health")
  @Header("Cache-Control", "no-store")
  @Policy(Policies.public())
  @ApiOkResponse({ type: HealthResponse })
  getHealth(): HealthResponse {
    return { status: "ok" };
  }

  @Get("ready")
  @Header("Cache-Control", "no-store")
  @Policy(Policies.public())
  @ApiOkResponse({ type: HealthResponse })
  @ApiServiceUnavailableResponse({
    description: "A required dependency is unavailable.",
  })
  async getReadiness(): Promise<HealthResponse> {
    if (!(await this.readiness.isReady())) {
      // Provider connection errors can contain secrets. Never return them.
      throw new ServiceUnavailableException();
    }
    return { status: "ok" };
  }
}
