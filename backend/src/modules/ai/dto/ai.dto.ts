import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Min,
} from "class-validator";

import { AiLocale } from "../ai.prompts";
import { OpportunityKind } from "../opportunity-retrieval.service";

const LOCALES: readonly AiLocale[] = ["bn", "en"];
const KINDS: readonly OpportunityKind[] = [
  "JOB",
  "LEARNING",
  "MENTOR",
  "GROUP",
];

/** POST /ai/consent */
export class AiConsentDto {
  /** The consent text version the app showed (GET /ai/status). */
  @IsInt()
  @Min(1)
  version!: number;
}

/** Body of the AI generation routes: output language override. */
export class AiLocaleDto {
  /** Default: the profile's locale, else the account's, else bn. */
  @IsOptional()
  @IsIn(LOCALES)
  locale?: AiLocale;
}

/** POST /ai/opportunity-suggestions */
export class OpportunitySuggestionsDto extends AiLocaleDto {
  /** Default: all four kinds. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(4)
  @IsIn(KINDS, { each: true })
  types?: OpportunityKind[];
}
