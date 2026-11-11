#!/usr/bin/env node
// In-memory stand-in for developer.bdapps.com, for local and CI tests only.
// No dependencies. Never point a production gateway at this server.
//
//   MOCK_PORT=18080 MOCK_APP_ID=test-app-id MOCK_APP_PASSWORD=test-app-password \
//   MOCK_CALLBACK_URL=http://127.0.0.1:18081/api/callback.php \
//   node bdapps-gateway/dev/mock-bdapps.mjs
//
// BDApps API (POST JSON; failures are HTTP 200 with statusCode != S1000):
//   /subscription/otp/request   E1351 when already REGISTERED (no OTP is sent)
//   /subscription/otp/verify    fixed OTP (MOCK_OTP, default 123456); E1850 wrong,
//                               E1851 expired, E1852 max 3 attempts, E1855 unknown ref
//   /subscription/getStatus     REGISTERED | UNREGISTERED | PENDING CHARGE
//   /subscription/send          action 1/0; E1351 already registered, E1356 already unregistered
//   /sms/send                   records messages (only to REGISTERED subscribers)
// Test controls:
//   GET  /__sms[?msisdn=8801...]          recorded SMS (newest last)
//   GET  /__subscribers                   state of every subscriber
//   POST /__config {mask, failSms, failUnsubscribe, failStatus}
//   POST /__state {subscriberId|msisdn, status}     set carrier state silently
//   POST /__notify {subscriberId|msisdn, status, timeStamp?}
//        sets the state and POSTs a BDApps notification to MOCK_CALLBACK_URL
//   POST /__replay                         re-sends the last notification verbatim
//   POST /__expire                         expires every outstanding OTP
//   POST /__reset                          clears all state
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.env.MOCK_PORT ?? 18080);
const host = process.env.MOCK_HOST ?? "127.0.0.1";
const appId = process.env.MOCK_APP_ID ?? "test-app-id";
const appPassword = process.env.MOCK_APP_PASSWORD ?? "test-app-password";
const fixedOtp = process.env.MOCK_OTP ?? "123456";
let callbackUrl = process.env.MOCK_CALLBACK_URL ?? "";

const config = {
  failSms: false,
  failStatus: false,
  failUnsubscribe: false,
  mask: process.env.MOCK_MASK === "1",
};
/** msisdn -> { status, maskedId } */
const subscribers = new Map();
/** referenceNo -> { msisdn, attempts, expiresAt, used } */
const otps = new Map();
const sms = [];
let lastNotification = null;

const OK = "S1000";

function maskedIdFor(msisdn) {
  const digest = createHash("sha256")
    .update(`kaaj-mock-mask:${msisdn}`)
    .digest("base64")
    .slice(0, 38);
  // Same shape as real masked ids: url-encoded bytes and base64 padding.
  return `tel:B%3C${digest}==`;
}

function subscriberFor(msisdn) {
  let entry = subscribers.get(msisdn);
  if (!entry) {
    entry = { maskedId: maskedIdFor(msisdn), status: "UNREGISTERED" };
    subscribers.set(msisdn, entry);
  }
  return entry;
}

function externalId(msisdn) {
  return config.mask ? subscriberFor(msisdn).maskedId : `tel:${msisdn}`;
}

/** Accepts tel:8801..., 8801..., +8801... or a masked id; returns the msisdn. */
function resolve(id) {
  if (typeof id !== "string") return null;
  const plain = id.replace(/^tel:/u, "").replace(/^\+/u, "");
  if (/^8801[3-9]\d{8}$/u.test(plain)) return plain;
  for (const [msisdn, entry] of subscribers) {
    if (entry.maskedId === id) return msisdn;
  }
  return null;
}

function normalizeStatus(value) {
  const status = String(value ?? "")
    .trim()
    .toUpperCase();
  if (status === "REGISTERED") return "REGISTERED";
  if (
    ["PENDING CHARGE", "CHARGE_PENDING", "PENDING", "CHARGE"].includes(status)
  )
    return "PENDING CHARGE";
  return "UNREGISTERED";
}

function authorized(body) {
  return body.applicationId === appId && body.password === appPassword;
}

function send(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  if (text === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function notify(msisdn, status, timeStamp) {
  const entry = subscriberFor(msisdn);
  entry.status = normalizeStatus(status);
  const notification = {
    applicationId: appId,
    frequency: "daily",
    password: appPassword,
    status: entry.status,
    subscriberId: externalId(msisdn),
    timeStamp:
      timeStamp ??
      new Date().toISOString().replace(/\D/gu, "").slice(2, 12) +
        randomBytes(2).toString("hex"),
    version: "1.0",
  };
  lastNotification = notification;
  return deliver(notification);
}

async function deliver(notification) {
  if (!callbackUrl) return { callbackStatus: null, notification };
  try {
    const response = await fetch(callbackUrl, {
      body: JSON.stringify(notification),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
    return {
      callbackBody: await response.text(),
      callbackStatus: response.status,
      notification,
    };
  } catch (error) {
    return { callbackError: String(error), callbackStatus: null, notification };
  }
}

const api = {
  "/subscription/otp/request"(body) {
    const msisdn = resolve(body.subscriberId);
    if (!msisdn)
      return { statusCode: "E1856", statusDetail: "Invalid Request" };
    if (subscriberFor(msisdn).status === "REGISTERED") {
      return { statusCode: "E1351", statusDetail: "user already registered" };
    }
    const referenceNo = `${Date.now()}${randomBytes(4).toString("hex")}`;
    otps.set(referenceNo, {
      attempts: 0,
      expiresAt: Date.now() + 60 * 60_000,
      msisdn,
      used: false,
    });
    return {
      referenceNo,
      statusCode: OK,
      statusDetail: "Success",
      version: "1.0",
    };
  },
  "/subscription/otp/verify"(body) {
    const challenge = otps.get(String(body.referenceNo ?? ""));
    if (!challenge || challenge.used)
      return { statusCode: "E1855", statusDetail: "Invalid Reference Number" };
    if (challenge.attempts >= 3)
      return {
        statusCode: "E1852",
        statusDetail: "Maximum number of OTP attempts had reached",
      };
    if (Date.now() > challenge.expiresAt)
      return {
        statusCode: "E1851",
        statusDetail: "OTP request has being expired",
      };
    if (body.otp !== fixedOtp) {
      challenge.attempts += 1;
      return { statusCode: "E1850", statusDetail: "Invalid OTP" };
    }
    challenge.used = true;
    subscriberFor(challenge.msisdn).status = "REGISTERED";
    return {
      statusCode: OK,
      statusDetail: "Success",
      subscriberId: externalId(challenge.msisdn),
      subscriptionStatus: "REGISTERED",
      version: "1.0",
    };
  },
  "/subscription/getStatus"(body) {
    if (config.failStatus)
      return { statusCode: "E1601", statusDetail: "System error" };
    const msisdn = resolve(body.subscriberId);
    if (!msisdn)
      return { statusCode: "E1325", statusDetail: "Invalid subscriber" };
    return {
      statusCode: OK,
      statusDetail: "Request was successfully processed",
      subscriptionStatus: subscriberFor(msisdn).status,
      version: "1.0",
    };
  },
  "/subscription/send"(body) {
    const msisdn = resolve(body.subscriberId);
    if (!msisdn)
      return { statusCode: "E1325", statusDetail: "Invalid subscriber" };
    const entry = subscriberFor(msisdn);
    if (String(body.action) === "1") {
      if (entry.status === "REGISTERED")
        return { statusCode: "E1351", statusDetail: "user already registered" };
      entry.status = "REGISTERED";
      return {
        statusCode: OK,
        statusDetail: "registered",
        subscriptionStatus: "REGISTERED",
        version: "1.0",
      };
    }
    if (config.failUnsubscribe)
      return { statusCode: "E1601", statusDetail: "System error" };
    if (entry.status === "UNREGISTERED")
      return { statusCode: "E1356", statusDetail: "user already unregistered" };
    entry.status = "UNREGISTERED";
    return {
      statusCode: OK,
      statusDetail: "not registered",
      subscriptionStatus: "UNREGISTERED",
      version: "1.0",
    };
  },
  "/sms/send"(body) {
    if (config.failSms)
      return { statusCode: "E1601", statusDetail: "System error" };
    if (
      typeof body.message !== "string" ||
      !Array.isArray(body.destinationAddresses)
    )
      return { statusCode: "E1312", statusDetail: "Request is invalid" };
    const destinationResponses = body.destinationAddresses.map((address) => {
      const msisdn = resolve(address);
      const timeStamp = new Date().toISOString();
      if (!msisdn || subscriberFor(msisdn).status !== "REGISTERED") {
        return {
          address,
          statusCode: "E1325",
          statusDetail: "Subscriber not registered",
          timeStamp,
        };
      }
      const messageId = randomBytes(8).toString("hex");
      sms.push({
        address,
        message: body.message,
        messageId,
        msisdn,
        sentAt: timeStamp,
      });
      return {
        address,
        messageId,
        statusCode: OK,
        statusDetail: "Success",
        timeStamp,
      };
    });
    return {
      destinationResponses,
      requestId: randomBytes(9).toString("hex"),
      statusCode: OK,
      statusDetail: "Success.",
      version: "1.0",
    };
  },
};
api["/otp/request"] = api["/subscription/otp/request"];
api["/otp/verify"] = api["/subscription/otp/verify"];

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}`);
  try {
    if (request.method === "GET" && url.pathname === "/__sms") {
      const msisdn = url.searchParams.get("msisdn");
      return send(response, 200, {
        messages: msisdn ? sms.filter((item) => item.msisdn === msisdn) : sms,
      });
    }
    if (request.method === "GET" && url.pathname === "/__subscribers") {
      return send(response, 200, {
        config,
        subscribers: Object.fromEntries(subscribers),
      });
    }
    if (request.method === "GET" && url.pathname === "/__health") {
      return send(response, 200, { ok: true });
    }
    if (request.method !== "POST")
      return send(response, 405, { error: "POST only" });
    const body = await readJson(request);
    if (body === null)
      return send(response, 400, {
        statusCode: "E1312",
        statusDetail: "Invalid JSON",
      });

    if (url.pathname.startsWith("/__")) {
      switch (url.pathname) {
        case "/__config":
          for (const key of Object.keys(config)) {
            if (typeof body[key] === "boolean") config[key] = body[key];
          }
          if (typeof body.callbackUrl === "string")
            callbackUrl = body.callbackUrl;
          return send(response, 200, { callbackUrl, config });
        case "/__state": {
          const msisdn = resolve(body.subscriberId ?? body.msisdn);
          if (!msisdn)
            return send(response, 400, { error: "unknown subscriber" });
          subscriberFor(msisdn).status = normalizeStatus(body.status);
          return send(response, 200, { msisdn, ...subscriberFor(msisdn) });
        }
        case "/__notify": {
          const msisdn = resolve(body.subscriberId ?? body.msisdn);
          if (!msisdn)
            return send(response, 400, { error: "unknown subscriber" });
          return send(
            response,
            200,
            await notify(msisdn, body.status, body.timeStamp),
          );
        }
        case "/__replay":
          if (!lastNotification)
            return send(response, 404, { error: "nothing to replay" });
          return send(response, 200, await deliver(lastNotification));
        case "/__expire":
          for (const challenge of otps.values()) challenge.expiresAt = 0;
          return send(response, 200, { expired: otps.size });
        case "/__reset":
          subscribers.clear();
          otps.clear();
          sms.length = 0;
          lastNotification = null;
          Object.assign(config, {
            failSms: false,
            failStatus: false,
            failUnsubscribe: false,
            mask: false,
          });
          return send(response, 200, { reset: true });
        default:
          return send(response, 404, { error: "unknown control endpoint" });
      }
    }

    const handler = api[url.pathname];
    if (!handler)
      return send(response, 404, {
        statusCode: "E1312",
        statusDetail: "Unknown API",
      });
    if (!authorized(body)) {
      return send(response, 200, {
        statusCode: "E1313",
        statusDetail:
          "Authentication failed: invalid applicationId or password",
      });
    }
    return send(response, 200, handler(body));
  } catch (error) {
    return send(response, 500, {
      statusCode: "E1601",
      statusDetail: String(error),
    });
  }
});

server.listen(port, host, () => {
  process.stdout.write(
    `mock-bdapps listening on http://${host}:${server.address().port}\n`,
  );
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
