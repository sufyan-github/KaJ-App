import { PrismaService } from "../../infra/prisma/prisma.service";
import { AiLocale } from "./ai.prompts";

/** The request's locale, else the profile's, else the account's, else bn. */
export async function resolveLocale(
  prisma: PrismaService,
  userId: string,
  requested?: AiLocale,
): Promise<AiLocale> {
  if (requested) return requested;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { default_locale: true, profile: { select: { locale: true } } },
  });
  const value = user?.profile?.locale ?? user?.default_locale;
  return value === "en" ? "en" : "bn";
}
