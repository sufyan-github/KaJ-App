import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";

class HealthResponse {
  status!: "ok";
}

@ApiTags("operations")
@Controller()
export class HealthController {
  @Get("health")
  @ApiOkResponse({ type: HealthResponse })
  getHealth(): HealthResponse {
    return { status: "ok" };
  }
}
