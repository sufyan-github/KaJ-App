import { Controller, Get, Module } from "@nestjs/common";

@Controller()
class FoundationController {
  @Get("health")
  getHealth(): { status: "ok" } {
    return { status: "ok" };
  }
}

@Module({ controllers: [FoundationController] })
export class AppModule {}
