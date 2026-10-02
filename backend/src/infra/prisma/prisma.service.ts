import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnApplicationShutdown
{
  // Let module destroy hooks finish their in-flight database work first.
  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
