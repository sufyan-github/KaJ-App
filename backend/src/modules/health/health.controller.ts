import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";

import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";

class HealthResponse {
  status!: "ok";
}

@ApiTags("operations")
@Controller()
export class HealthController {
  @Get("health")
  @Policy(Policies.public())
  @ApiOkResponse({ type: HealthResponse })
  getHealth(): HealthResponse {
    return { status: "ok" };
  }
}
