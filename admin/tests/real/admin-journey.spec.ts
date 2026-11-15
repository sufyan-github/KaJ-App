import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { FIXTURE_FILE } from "./global-setup";

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits), as the API verifies it. */
function totp(secret: string, now = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.toUpperCase().replace(/=+$/u, ""))
    bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const key = Buffer.from(
    bits.match(/.{8}/gu)!.map((byte) => Number.parseInt(byte, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set (see .env.example).`);
  return value;
}

test("an operator signs in, suspends and restores a job, and sees it in the audit trail", async ({
  page,
}) => {
  const { jobTitle } = JSON.parse(readFileSync(FIXTURE_FILE, "utf8")) as {
    jobTitle: string;
  };

  // Password, then authenticator code, against the real API.
  await page.goto("/");
  await page.getByLabel("Email address").fill(required("ADMIN_SEED_EMAIL"));
  await page.getByLabel("Password").fill(required("ADMIN_SEED_PASSWORD"));
  await page.getByRole("button", { name: "Continue securely" }).click();
  await page
    .getByLabel("Authenticator code")
    .fill(totp(required("ADMIN_SEED_TOTP_SECRET")));
  await page.getByRole("button", { name: "Open operations" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  // The job list comes from the database through the API.
  await page.getByRole("button", { name: "Jobs" }).click();
  const row = page.getByRole("row").filter({ hasText: jobTitle });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Applications open");

  // Suspend: the dialog offers only the states the job rules allow.
  await row.getByRole("button", { name: "Force transition" }).click();
  const target = page.getByLabel("Target status");
  await expect(target.locator("option")).toContainText(["SUSPENDED"]);
  await expect(
    target.locator("option", { hasText: "IN_PROGRESS" }),
  ).toHaveCount(0);
  await target.selectOption("SUSPENDED");
  await page
    .getByLabel("Required operational reason")
    .fill("Journey test: pausing the job for review.");
  await page.getByRole("button", { name: "Apply forced transition" }).click();
  await expect(row).toContainText("Suspended");

  // Restore it to where it was.
  await row.getByRole("button", { name: "Force transition" }).click();
  await page.getByLabel("Target status").selectOption("APPLICATIONS_OPEN");
  await page
    .getByLabel("Required operational reason")
    .fill("Journey test: review finished, reopening.");
  await page.getByRole("button", { name: "Apply forced transition" }).click();
  await expect(row).toContainText("Applications open");

  // Both changes are in the audit trail.
  await page.getByRole("button", { name: "Audit trail" }).click();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: /force transitioned/i })
      .first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByLabel("Email address")).toBeVisible();
});
