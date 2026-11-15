import { Params } from "nestjs-pino";
import { redactOptions } from "pino";

export const loggerRedaction: redactOptions = {
  censor: "[Redacted]",
  paths: [
    "authorization",
    "password",
    "code",
    "token",
    "phone",
    "*.authorization",
    "*.password",
    "*.code",
    "*.token",
    "*.phone",
    "req.headers.authorization",
    "req.headers.Authorization",
    "request.headers.authorization",
    "request.headers.Authorization",
    "body.authorization",
    "body.password",
    "body.code",
    "body.token",
    "body.phone",
  ],
};

export function createLoggerConfig(nodeEnvironment: string): Params {
  return {
    pinoHttp: {
      autoLogging: false,
      level: nodeEnvironment === "test" ? "silent" : "info",
      redact: loggerRedaction,
      serializers: {
        // Path only: query strings carry searches such as phone numbers.
        req: (request) => ({
          id: request.id,
          method: request.method,
          url: pathOnly(request.url),
        }),
        res: (response) => ({ statusCode: response.statusCode }),
      },
    },
  };
}

/** Drops the query string (and fragment) from a request URL. */
export function pathOnly(url: string | undefined): string {
  return (url ?? "").split(/[?#]/u)[0] ?? "";
}
