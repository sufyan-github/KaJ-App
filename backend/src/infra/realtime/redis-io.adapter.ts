import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { Server, ServerOptions } from "socket.io";

/**
 * P3.3: socket.io over Redis pub/sub, so chat messages reach sockets on
 * every API instance (rooms, fetchSockets and emits work across nodes).
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private clients: Redis[] = [];

  async connectToRedis(url: string): Promise<void> {
    const pub = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
    const sub = pub.duplicate();
    await Promise.all([pub.connect(), sub.connect()]);
    this.clients = [pub, sub];
    this.adapterConstructor = createAdapter(pub, sub, {
      key: "kaj:socket.io",
    });
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }

  override async close(server: Server): Promise<void> {
    await super.close(server);
    await Promise.all(
      this.clients.map((client) => client.quit().catch(() => undefined)),
    );
    this.clients = [];
  }
}

/**
 * Uses the Redis adapter when SOCKET_REDIS_ADAPTER=true (needed once more
 * than one API instance runs); otherwise socket.io's in-memory adapter.
 * Call before app.listen().
 */
export async function configureRealtime(
  app: INestApplication,
  options: { force?: boolean } = {},
): Promise<boolean> {
  const config = app.get(ConfigService);
  if (!options.force && config.get<string>("SOCKET_REDIS_ADAPTER") !== "true")
    return false;
  const adapter = new RedisIoAdapter(app);
  await adapter.connectToRedis(config.getOrThrow<string>("REDIS_URL"));
  app.useWebSocketAdapter(adapter);
  return true;
}
