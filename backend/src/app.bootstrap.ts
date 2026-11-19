import {
  INestApplication,
  Logger,
  RequestMethod,
  ValidationPipe,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { ValidationError } from "class-validator";
import helmet from "helmet";

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
  const production = config.get<string>("NODE_ENV") === "production";
  // Security headers (nosniff, frame-ancestors, HSTS, no X-Powered-By, …).
  // The JSON API needs no content policy beyond the default; outside
  // production it is off so the Swagger UI at /docs can load.
  app.use(helmet({ contentSecurityPolicy: production ? undefined : false }));

  const proxyWarning = trustProxyWarning(process.env);
  if (proxyWarning) new Logger("Bootstrap").warn(proxyWarning);
  const proxyHops = config.get<number>("TRUST_PROXY_HOPS") ?? 0;
  if (proxyHops > 0) {
    // So request.ip (per-IP limits, audit logs) is the client, not the proxy.
    (
      app.getHttpAdapter().getInstance() as {
        set(key: string, value: number): void;
      }
    ).set("trust proxy", proxyHops);
  }
  if (!production) {
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

/**
 * CFG-2: behind Render's proxy every request arrives from the proxy unless
 * TRUST_PROXY_HOPS says how many hops to trust; per-IP limits (OTP: 20/hour)
 * would then be shared by everyone. Production must set it explicitly (0 is
 * a valid explicit answer when nothing sits in front).
 */
export function trustProxyWarning(
  env: Record<string, string | undefined>,
): string | null {
  if (env.NODE_ENV !== "production") return null;
  if (env.TRUST_PROXY_HOPS !== undefined && env.TRUST_PROXY_HOPS.trim() !== "")
    return null;
  return (
    "TRUST_PROXY_HOPS is not set in production: request.ip will be the proxy's " +
    "address and per-IP rate limits will be shared by every user. Set it to the " +
    "number of proxies in front of the API (Render: see docs/deploy-runbook.md)."
  );
}
