import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";

import { RequestContextMiddleware } from "./common/context/request-context.middleware";
import {
  CryptoRequestIdGenerator,
  REQUEST_ID_GENERATOR,
} from "./common/context/request-id.generator";
import { RequestContextStorage } from "./common/context/request-context.storage";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { JwtGuard } from "./common/guards/jwt.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { ResponseInterceptor } from "./common/interceptors/response.interceptor";
import { AbilityFactory } from "./common/policy/ability.factory";
import { PolicyGuard } from "./common/policy/policy.guard";
import { TimeModule } from "./common/time/time.module";
import { validateEnvironment } from "./config/environment";
import { createLoggerConfig } from "./config/logger.config";
import { InfrastructureModule } from "./infra/infrastructure.module";
import { HealthModule } from "./modules/health/health.module";
import { AvailabilityModule } from "./modules/availability/availability.module";
import { UsersModule } from "./modules/users/users.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CatalogModule } from "./modules/catalog/catalog.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    TimeModule,
    InfrastructureModule,
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createLoggerConfig(config.get<string>("NODE_ENV", "development")),
    }),
    AuthModule,
    AvailabilityModule,
    CatalogModule,
    HealthModule,
    UsersModule,
  ],
  providers: [
    AbilityFactory,
    RequestContextMiddleware,
    RequestContextStorage,
    { provide: REQUEST_ID_GENERATOR, useClass: CryptoRequestIdGenerator },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: JwtGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PolicyGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware)
      .forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}
