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
import { UploadsModule } from "./modules/uploads/uploads.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { ReviewsModule } from "./modules/reviews/reviews.module";
import { ChatModule } from "./modules/chat/chat.module";
import { AdminAuthModule } from "./modules/admin-auth/admin-auth.module";
import { AdminOpsModule } from "./modules/admin-ops/admin-ops.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { VerificationModule } from "./modules/verification/verification.module";
import { DisputesModule } from "./modules/disputes/disputes.module";
import { AttendanceModule } from "./modules/attendance/attendance.module";

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
    AdminAuthModule,
    AdminOpsModule,
    PaymentsModule,
    VerificationModule,
    DisputesModule,
    AttendanceModule,
    AvailabilityModule,
    CatalogModule,
    HealthModule,
    JobsModule,
    NotificationsModule,
    ReviewsModule,
    ChatModule,
    UsersModule,
    UploadsModule,
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
