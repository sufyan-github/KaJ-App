# bdapps integration

Kaaj keeps bdapps credentials in the PHP gateway and uses a separate HMAC key
between Nest and PHP. No bdapps credential or provider reference is sent to the
Flutter client.

## Runtime flow

1. Nest creates its normal rate-limited OTP challenge.
2. With `SMS_PROVIDER=bdapps`, the SMS adapter asks the PHP gateway to create the
   bdapps OTP and stores only the returned reference in Redis for the lifetime of
   the challenge.
3. Nest sends the entered code back through the gateway. A session is created
   only when bdapps returns success for the same normalized phone number.
4. With `OPERATOR_PROVIDER=bdapps`, subscription screens re-check live operator
   state. `REGISTERED` can activate a selected pending plan; an operator-confirmed
   inactive state cancels cached access without deleting user or job data.
5. The PHP callback forwards independently verified changes to
   `/api/v1/subscriptions/bdapps/webhook`. Nest verifies HMAC, timestamp, and nonce
   before updating subscription state.

The identity-verification workflow is intentionally separate. Phone/operator
verification never replaces the required NID and selfie review before applying
for work; experience and expertise remain optional.

## Required configuration

Nest:

```dotenv
SMS_PROVIDER=bdapps
OPERATOR_PROVIDER=bdapps
BDAPPS_GATEWAY_URL=https://gateway.example/api
BDAPPS_INTERNAL_API_KEY=<same 32+ character HMAC key as PHP INTERNAL_API_KEY>
```

PHP:

```dotenv
BDAPPS_APP_ID=<Kaaj application id>
BDAPPS_PASSWORD=<Kaaj API key>
BDAPPS_APP_HASH=<Kaaj application hash from bdapps>
INTERNAL_API_KEY=<same HMAC key as Nest>
NODE_BACKEND_URL=https://api.example
NODE_BACKEND_WEBHOOK_PATH=/api/v1/subscriptions/bdapps/webhook
```

Use HTTPS for both services in production. Keep `.env`, gateway logs, and nonce
storage outside the public document root where possible.

## Launch requirements

- Configure the exact Kaaj application hash; never reuse another bdapps app's
  hash.
- Match the active Kaaj subscription plan price and duration to the charging
  product configured in bdapps. A provider `REGISTERED` response confirms carrier
  entitlement; it must not be mapped to an unrelated local plan.
- Show the exact price, recurrence, and unsubscribe method approved by bdapps
  before sending a subscription OTP.
- Test request, incorrect OTP, correct OTP, resend throttling, `REGISTERED`,
  `UNSUBSCRIBED`, callback replay, gateway outage, and session expiry with a
  whitelisted number before requesting production activation.
- Carrier billing cannot be cancelled by changing only the Kaaj database. The app
  instructs users to follow the operator-approved unsubscribe method and waits for
  status/callback confirmation.
