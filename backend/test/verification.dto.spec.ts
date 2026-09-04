import { VerificationKind } from "@prisma/client";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { SubmitVerificationDto } from "../src/modules/verification/dto/verification.dto";

describe("SubmitVerificationDto", () => {
  const nidDocumentId = "6b491514-769f-4b22-873d-4effbf888b4c";
  const selfieDocumentId = "ed1c0135-a882-44ac-8939-b70c79a1c83d";

  it("requires separately labelled NID and selfie documents for identity", async () => {
    const input = plainToInstance(SubmitVerificationDto, {
      kind: VerificationKind.IDENTITY,
      documentIds: [nidDocumentId, selfieDocumentId],
    });

    const errors = await validate(input);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(["nidDocumentId", "selfieDocumentId"]),
    );
  });

  it("accepts a complete labelled identity submission", async () => {
    const input = plainToInstance(SubmitVerificationDto, {
      kind: VerificationKind.IDENTITY,
      nidDocumentId,
      selfieDocumentId,
    });

    await expect(validate(input)).resolves.toHaveLength(0);
  });
});
