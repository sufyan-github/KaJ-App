import { Writable } from "node:stream";

import pino from "pino";

import {
  createLoggerConfig,
  loggerRedaction,
} from "../src/config/logger.config";

describe("logger redaction", () => {
  it("removes authorization, password, code, token, and phone values", () => {
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const logger = pino({ redact: loggerRedaction }, destination);

    const secrets = {
      authorization: "Bearer secret-access-token",
      code: "123456",
      password: "correct-horse-battery-staple",
      phone: "+8801712345678",
      token: "refresh-token-value",
    };

    logger.info(
      {
        ...secrets,
        req: { headers: { authorization: secrets.authorization } },
      },
      "redaction probe",
    );

    for (const secret of Object.values(secrets)) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain("[Redacted]");
  });

  it("silences only the test environment", () => {
    expect(createLoggerConfig("test").pinoHttp).toMatchObject({
      level: "silent",
    });
    expect(createLoggerConfig("production").pinoHttp).toMatchObject({
      level: "info",
    });
  });
});
