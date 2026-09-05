import { ConsoleSmsAdapter } from "../src/infra/sms/console.adapter";
import { CryptoOtpCodeGenerator } from "../src/modules/auth/otp-code.generator";
import {
  isRobiOrAirtelPhone,
  normalizeBangladeshPhone,
} from "../src/modules/auth/phone";
import { parseTtlSeconds } from "../src/modules/auth/ttl";

describe("auth primitives", () => {
  it.each([
    ["01712 345-678", "+8801712345678"],
    ["8801712345678", "+8801712345678"],
    ["+8801712345678", "+8801712345678"],
    ["+14155552671", null],
    ["01234567890", null],
  ])("normalizes %s as %s", (input, expected) => {
    expect(normalizeBangladeshPhone(input)).toBe(expected);
  });

  it.each([
    ["+8801812345678", true],
    ["+8801612345678", true],
    ["+8801712345678", false],
    ["+8801912345678", false],
  ])(
    "checks whether %s uses a supported operator prefix",
    (phone, expected) => {
      expect(isRobiOrAirtelPhone(phone)).toBe(expected);
    },
  );

  it("parses configured access and refresh TTLs", () => {
    expect(parseTtlSeconds("15m")).toBe(900);
    expect(parseTtlSeconds("30d")).toBe(2_592_000);
    expect(() => parseTtlSeconds("forever")).toThrow("Unsupported TTL value");
  });

  it("always generates a six-digit OTP", () => {
    const generator = new CryptoOtpCodeGenerator();
    for (let index = 0; index < 100; index += 1) {
      expect(generator.generate()).toMatch(/^\d{6}$/);
    }
  });

  it("never writes the OTP or full phone number to the console", async () => {
    const output: string[] = [];
    const write = jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk) => {
        output.push(String(chunk));
        return true;
      });

    try {
      await new ConsoleSmsAdapter().sendOtp({
        challengeId: "challenge-safe-to-log",
        code: "123456",
        expiresInSeconds: 300,
        phoneE164: "+8801712345678",
      });
    } finally {
      write.mockRestore();
    }

    const logged = output.join("");
    expect(logged).toContain("+880******78");
    expect(logged).not.toContain("123456");
    expect(logged).not.toContain("+8801712345678");
  });
});
