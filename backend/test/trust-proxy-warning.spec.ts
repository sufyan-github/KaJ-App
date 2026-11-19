import { trustProxyWarning } from "../src/app.bootstrap";

/** CFG-2: production must say when the proxy hop count was never set. */
describe("trust proxy warning", () => {
  it("warns in production when TRUST_PROXY_HOPS is unset", () => {
    expect(trustProxyWarning({ NODE_ENV: "production" })).toMatch(
      /TRUST_PROXY_HOPS/,
    );
    expect(
      trustProxyWarning({ NODE_ENV: "production", TRUST_PROXY_HOPS: "" }),
    ).toMatch(/TRUST_PROXY_HOPS/);
  });

  it("is quiet once it is set, and outside production", () => {
    expect(
      trustProxyWarning({ NODE_ENV: "production", TRUST_PROXY_HOPS: "1" }),
    ).toBeNull();
    expect(
      trustProxyWarning({ NODE_ENV: "production", TRUST_PROXY_HOPS: "0" }),
    ).toBeNull();
    expect(trustProxyWarning({ NODE_ENV: "development" })).toBeNull();
  });
});
