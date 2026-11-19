import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AiFeature, JobStatus } from "@prisma/client";

import { CLOCK, Clock } from "../../common/time/clock";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { resolveLocale } from "./ai-locale";
import { AiRunnerService } from "./ai-runner.service";
import { AiLocale, GROWTH_TIPS_SYSTEM, userTurn } from "./ai.prompts";
import { GrowthTips, growthTipsSchema } from "./ai.schemas";
import { redactText } from "./redaction";

export interface GrowthTipsView {
  businessId: string;
  /** AI = written by the model; FALLBACK = KAAJ's standard tips. */
  source: "AI" | "FALLBACK";
  locale: AiLocale;
  generatedAt: string;
  summary: string;
  tips: GrowthTips["tips"];
}

/**
 * Free, quota-limited growth tips for a business, for its accepted members
 * (policy on the route). Sends the business's category, stage, size, area,
 * redacted description and offerings — never its name, address, trade
 * licence, contact person or members.
 */
@Injectable()
export class BusinessGrowthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: AiRunnerService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async tips(
    userId: string,
    businessId: string,
    requestedLocale?: AiLocale,
  ): Promise<GrowthTipsView> {
    await this.runner.assertReady(userId);
    const business = await this.prisma.businessProfile.findFirst({
      where: { id: businessId, deleted_at: null },
      select: {
        id: true,
        stage: true,
        employees_count: true,
        description: true,
        is_public: true,
        seeking_partners: true,
        verification_status: true,
        created_at: true,
        category: { select: { name_en: true } },
        location: {
          select: { name_en: true, parent: { select: { name_en: true } } },
        },
        offerings: {
          where: { deleted_at: null, hidden_at: null, is_active: true },
          select: {
            kind: true,
            title_en: true,
            title_bn: true,
            description: true,
            price_min_poisha: true,
            price_max_poisha: true,
            price_unit: true,
          },
          orderBy: { sort_order: "asc" },
          take: 10,
        },
        _count: {
          select: { jobs: { where: { status: JobStatus.APPLICATIONS_OPEN } } },
        },
      },
    });
    if (!business) throw new NotFoundException();
    const locale = await resolveLocale(this.prisma, userId, requestedLocale);
    const now = this.clock.now();

    const result = await this.runner.run({
      userId,
      feature: AiFeature.BUSINESS_GROWTH_TIPS,
      subjectId: business.id,
      request: {
        system: GROWTH_TIPS_SYSTEM,
        prompt: userTurn(locale, "Give growth tips for this business.", {
          business: {
            category: business.category?.name_en ?? null,
            stage: business.stage,
            employees: business.employees_count,
            area: business.location
              ? [business.location.name_en, business.location.parent?.name_en]
                  .filter(Boolean)
                  .join(", ")
              : null,
            description: redactText(business.description),
            listedPublicly: business.is_public,
            seekingPartners: business.seeking_partners,
            verified: business.verification_status === "APPROVED",
            monthsOnKaaj: Math.max(
              0,
              Math.floor(
                (now.getTime() - business.created_at.getTime()) / 2_629_800_000,
              ),
            ),
            openJobs: business._count.jobs,
            offerings: business.offerings.map((offering) => ({
              kind: offering.kind,
              title: redactText(offering.title_en ?? offering.title_bn),
              about: redactText(offering.description)?.slice(0, 200) ?? null,
              priceBdt: {
                min:
                  offering.price_min_poisha === null
                    ? null
                    : Number(offering.price_min_poisha / 100n),
                max:
                  offering.price_max_poisha === null
                    ? null
                    : Number(offering.price_max_poisha / 100n),
                unit: offering.price_unit,
              },
            })),
          },
        }),
        schema: growthTipsSchema,
        effort: "low",
        maxTokens: 8_000,
      },
    });
    const generatedAt = now.toISOString();
    if (result.outcome !== "SUCCESS")
      return {
        businessId: business.id,
        source: "FALLBACK",
        locale,
        generatedAt,
        ...FALLBACK_TIPS[locale],
      };
    return {
      businessId: business.id,
      source: "AI",
      locale,
      generatedAt,
      ...result.data,
    };
  }
}

/** Safe, generic tips shown when the model declines or answers badly. */
export const FALLBACK_TIPS: Record<AiLocale, GrowthTips> = {
  en: {
    summary:
      "Here are KAAJ's standard first steps for growing a small business.",
    tips: [
      {
        title: "Keep a simple daily record",
        detail:
          "Write down every sale and expense each day in a notebook or a free phone app. Keep business money separate from household money. After a month you will see which products really earn.",
        area: "FINANCE",
        effort: "LOW",
        costBdt: { min: 0, max: 200 },
        kaajAction: "LEARN_SKILL",
      },
      {
        title: "Show your work where customers look",
        detail:
          "Add your products or services with prices to your KAAJ business page and post clear photos of finished work on Facebook or WhatsApp every week.",
        area: "MARKETING",
        effort: "LOW",
        costBdt: { min: 0, max: 500 },
        kaajAction: "LIST_OFFERING",
      },
      {
        title: "Ask regular customers what they need",
        detail:
          "Talk to five regular customers this week. Ask what else they would buy from you and what would make them come more often. Try the most common answer first.",
        area: "CUSTOMER_SERVICE",
        effort: "LOW",
        costBdt: { min: 0, max: 0 },
        kaajAction: "NONE",
      },
      {
        title: "Learn from people in your trade",
        detail:
          "Join a local KAAJ group for your trade or area, or ask an expert one specific question about pricing or suppliers.",
        area: "PARTNERSHIPS",
        effort: "LOW",
        costBdt: { min: 0, max: 0 },
        kaajAction: "JOIN_GROUP",
      },
    ],
  },
  bn: {
    summary: "ছোট ব্যবসা বাড়ানোর জন্য KAAJ-এর সাধারণ প্রথম ধাপগুলো এখানে।",
    tips: [
      {
        title: "প্রতিদিনের সহজ হিসাব রাখুন",
        detail:
          "প্রতিদিনের সব বিক্রি ও খরচ খাতায় বা ফোনের একটি ফ্রি অ্যাপে লিখুন। ব্যবসার টাকা আর সংসারের টাকা আলাদা রাখুন। এক মাস পরে বুঝবেন কোন পণ্যে আসল লাভ হচ্ছে।",
        area: "FINANCE",
        effort: "LOW",
        costBdt: { min: 0, max: 200 },
        kaajAction: "LEARN_SKILL",
      },
      {
        title: "ক্রেতারা যেখানে খোঁজেন, সেখানে কাজ দেখান",
        detail:
          "KAAJ-এর ব্যবসার পাতায় দামসহ পণ্য বা সেবা যোগ করুন, আর প্রতি সপ্তাহে ফেসবুক বা হোয়াটসঅ্যাপে তৈরি কাজের পরিষ্কার ছবি দিন।",
        area: "MARKETING",
        effort: "LOW",
        costBdt: { min: 0, max: 500 },
        kaajAction: "LIST_OFFERING",
      },
      {
        title: "নিয়মিত ক্রেতাদের জিজ্ঞেস করুন",
        detail:
          "এই সপ্তাহে পাঁচজন নিয়মিত ক্রেতার সাথে কথা বলুন। তারা আপনার কাছ থেকে আর কী কিনতে চান, কী হলে আরও বেশি আসবেন—জিজ্ঞেস করুন। সবচেয়ে বেশি যেটা বলেন, সেটা আগে চেষ্টা করুন।",
        area: "CUSTOMER_SERVICE",
        effort: "LOW",
        costBdt: { min: 0, max: 0 },
        kaajAction: "NONE",
      },
      {
        title: "একই পেশার মানুষের কাছ থেকে শিখুন",
        detail:
          "আপনার পেশা বা এলাকার একটি KAAJ গ্রুপে যোগ দিন, অথবা দাম বা সরবরাহকারী নিয়ে একজন বিশেষজ্ঞকে একটি নির্দিষ্ট প্রশ্ন করুন।",
        area: "PARTNERSHIPS",
        effort: "LOW",
        costBdt: { min: 0, max: 0 },
        kaajAction: "JOIN_GROUP",
      },
    ],
  },
};
