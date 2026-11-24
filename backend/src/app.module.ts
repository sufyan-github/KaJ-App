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
import { AccountModerationGuard } from "./common/guards/account-moderation.guard";
import {
  ACCOUNT_MODERATION_READER,
  PrismaAccountModerationReader,
} from "./common/guards/account-moderation.reader";
import { RolesGuard } from "./common/guards/roles.guard";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { ResponseInterceptor } from "./common/interceptors/response.interceptor";
import { IdempotencyInterceptor } from "./common/idempotency/idempotency";
import { AbilityFactory } from "./common/policy/ability.factory";
import { PolicyGuard } from "./common/policy/policy.guard";
import { PolicyResourceResolver } from "./common/policy/policy-resource.resolver";
import { TimeModule } from "./common/time/time.module";
import {
  UserRateLimitGuard,
  UserRateLimitModule,
} from "./common/rate-limit/user-rate-limit";
import { validateEnvironment } from "./config/environment";
import { createLoggerConfig } from "./config/logger.config";
import { InfrastructureModule } from "./infra/infrastructure.module";
import { HealthModule } from "./modules/health/health.module";
import { AvailabilityModule } from "./modules/availability/availability.module";
import { UsersModule } from "./modules/users/users.module";
import { TrainingModule } from "./modules/training/training.module";
import { JobAlertsModule } from "./modules/job-alerts/job-alerts.module";
import { UploadsModule } from "./modules/uploads/uploads.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { ReviewsModule } from "./modules/reviews/reviews.module";
import { ChatModule } from "./modules/chat/chat.module";
import { AdminAuthModule } from "./modules/admin-auth/admin-auth.module";
import { AdminOpsModule } from "./modules/admin-ops/admin-ops.module";
import { AdminDirectoryModule } from "./modules/admin-directory/admin-directory.module";
import { AdminStaffModule } from "./modules/admin-staff/admin-staff.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { VerificationModule } from "./modules/verification/verification.module";
import { DisputesModule } from "./modules/disputes/disputes.module";
import { AttendanceModule } from "./modules/attendance/attendance.module";
import { ModerationModule } from "./modules/moderation/moderation.module";
import { RiskModule } from "./modules/risk/risk.module";
import { SubscriptionGuard } from "./modules/subscriptions/subscription.guard";
import { SubscriptionsModule } from "./modules/subscriptions/subscriptions.module";
import { SafetyModule } from "./modules/safety/safety.module";
import { MentorsModule } from "./modules/mentors/mentors.module";
import { LearningModule } from "./modules/learning/learning.module";
import { BusinessModule } from "./modules/business/business.module";
import { IdeasModule } from "./modules/ideas/ideas.module";
import { ExpertsModule } from "./modules/experts/experts.module";
import { CommunityModule } from "./modules/community/community.module";
import { AiModule } from "./modules/ai/ai.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    TimeModule,
    InfrastructureModule,
    SafetyModule,
    MentorsModule,
    LearningModule,
    BusinessModule,
    IdeasModule,
    ExpertsModule,
    CommunityModule,
    AiModule,
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createLoggerConfig(config.get<string>("NODE_ENV", "development")),
    }),
    AuthModule,
    AdminAuthModule,
    AdminOpsModule,
    AdminStaffModule,
    AdminDirectoryModule,
    PaymentsModule,
    VerificationModule,
    DisputesModule,
    AttendanceModule,
    ModerationModule,
    RiskModule,
    SubscriptionsModule,
    AvailabilityModule,
    CatalogModule,
    HealthModule,
    JobsModule,
    NotificationsModule,
    ReviewsModule,
    ChatModule,
    UsersModule,
    UploadsModule,
    TrainingModule,
    JobAlertsModule,
    UserRateLimitModule,
  ],
  providers: [
    AbilityFactory,
    PolicyResourceResolver,
    RequestContextMiddleware,
    RequestContextStorage,
    PrismaAccountModerationReader,
    {
      provide: ACCOUNT_MODERATION_READER,
      useExisting: PrismaAccountModerationReader,
    },
    { provide: REQUEST_ID_GENERATOR, useClass: CryptoRequestIdGenerator },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: JwtGuard },
    { provide: APP_GUARD, useClass: AccountModerationGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PolicyGuard },
    { provide: APP_GUARD, useClass: SubscriptionGuard },
    { provide: APP_GUARD, useClass: UserRateLimitGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    // Inside the envelope: it keeps and replays the handler's own answer.
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware)
      .forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}
