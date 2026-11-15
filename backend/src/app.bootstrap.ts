import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { ValidationError } from "class-validator";

import { RequestValidationException } from "./common/errors/validation.exception";

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix("api/v1", {
    exclude: [
      { path: "health", method: RequestMethod.GET },
      { path: "ready", method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      exceptionFactory: (errors: ValidationError[]) =>
        new RequestValidationException(errors),
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const proxyHops = config.get<number>("TRUST_PROXY_HOPS") ?? 0;
  if (proxyHops > 0) {
    // So request.ip (per-IP limits, audit logs) is the client, not the proxy.
    (
      app.getHttpAdapter().getInstance() as {
        set(key: string, value: number): void;
      }
    ).set("trust proxy", proxyHops);
  }
  if (config.get<string>("NODE_ENV") !== "production") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("KAJ API")
      .setDescription("Bangla-first local work marketplace API")
      .setVersion("1")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("docs", app, document);
  }
}
