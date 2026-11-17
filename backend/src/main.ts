import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";

import { configureApp } from "./app.bootstrap";
import { AppModule } from "./app.module";
import { configureRealtime } from "./infra/realtime/redis-io.adapter";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);
  // Errors outside a request (schedulers, event handlers) were invisible.
  process.on("unhandledRejection", (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.error(
      { err: { name: error.name, message: error.message } },
      error.stack,
      "unhandledRejection",
    );
  });
  configureApp(app);
  await configureRealtime(app);
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  await app.listen(config.get<number>("PORT", 3000), "0.0.0.0");
}

void bootstrap();
