import { Inject, Injectable } from "@nestjs/common";

import { CLOCK, Clock } from "../../common/time/clock";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { aiErrors } from "./ai.errors";
import { AI_CONSENT_VERSION } from "./ai.settings";

export interface AiConsentView {
  required: true;
  currentVersion: number;
  accepted: boolean;
  acceptedVersion: number | null;
  acceptedAt: string | null;
}

/**
 * The one-time opt-in: nothing about a user reaches the model until they
 * accept the current consent text. Withdrawing stops every later call;
 * stored results stay (they are the user's own).
 */
@Injectable()
export class AiConsentService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async view(userId: string): Promise<AiConsentView> {
    const row = await this.prisma.aiConsent.findUnique({
      where: { user_id: userId },
    });
    const active = row !== null && row.withdrawn_at === null;
    return {
      required: true,
      currentVersion: AI_CONSENT_VERSION,
      accepted: active && row.version >= AI_CONSENT_VERSION,
      acceptedVersion: active ? row.version : null,
      acceptedAt: active ? row.consented_at.toISOString() : null,
    };
  }

  async assertGiven(userId: string): Promise<void> {
    if (!(await this.view(userId)).accepted)
      throw aiErrors.consentRequired(AI_CONSENT_VERSION);
  }

  async accept(userId: string, version: number): Promise<AiConsentView> {
    if (version !== AI_CONSENT_VERSION)
      throw aiErrors.consentVersion(AI_CONSENT_VERSION);
    const now = this.clock.now();
    await this.prisma.$transaction([
      this.prisma.aiConsent.upsert({
        where: { user_id: userId },
        create: { user_id: userId, version, consented_at: now },
        update: { version, consented_at: now, withdrawn_at: null },
      }),
      this.prisma.auditLog.create({
        data: {
          actor_user_id: userId,
          action: "ai.consent.accepted",
          entity: "ai_consent",
          entity_id: userId,
          after_json: { version, consentedAt: now.toISOString() },
        },
      }),
    ]);
    return this.view(userId);
  }

  async withdraw(userId: string): Promise<AiConsentView> {
    const now = this.clock.now();
    const updated = await this.prisma.aiConsent.updateMany({
      where: { user_id: userId, withdrawn_at: null },
      data: { withdrawn_at: now },
    });
    if (updated.count > 0)
      await this.prisma.auditLog.create({
        data: {
          actor_user_id: userId,
          action: "ai.consent.withdrawn",
          entity: "ai_consent",
          entity_id: userId,
          after_json: { withdrawnAt: now.toISOString() },
        },
      });
    return this.view(userId);
  }
}
