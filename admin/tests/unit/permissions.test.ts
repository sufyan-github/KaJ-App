import assert from "node:assert/strict";
import { test } from "node:test";

import { ADMIN_ROUTE_ROLES } from "../../lib/admin-route-roles.ts";
import {
  CONSOLE_MODULES,
  canCall,
  visibleModules,
  visibleTabs,
} from "../../lib/permissions.ts";

const ROLES = ["ADMIN", "MODERATOR", "SUPPORT", "FINANCE"] as const;
const keys = (role: string | null) =>
  visibleModules(role).map((module) => module.key);

test("ADMIN sees every module and every tab", () => {
  assert.deepEqual(
    keys("ADMIN"),
    CONSOLE_MODULES.map((module) => module.key),
  );
  for (const module of CONSOLE_MODULES)
    assert.equal(visibleTabs("ADMIN", module).length, module.tabs?.length ?? 0);
});

test("FINANCE sees money and configuration, not safety queues", () => {
  const finance = keys("FINANCE");
  for (const key of ["config", "subscriptions", "jobPayments", "disputes"])
    assert.ok(finance.includes(key as never), key);
  for (const key of [
    "reports",
    "risk",
    "verification",
    "learn",
    "business",
    "community",
    "notifications",
  ])
    assert.ok(!finance.includes(key as never), key);
});

test("MODERATOR and SUPPORT do not see configuration or subscriptions", () => {
  for (const role of ["MODERATOR", "SUPPORT"]) {
    const visible = keys(role);
    assert.ok(!visible.includes("config"), role);
    assert.ok(!visible.includes("subscriptions"), role);
  }
  assert.ok(keys("SUPPORT").includes("notifications"));
  assert.ok(!keys("MODERATOR").includes("notifications"));
});

test("actions follow the matrix, not the view", () => {
  // SUPPORT may dry-run a campaign but only ADMIN may send it.
  assert.equal(canCall("SUPPORT", "POST notifications/campaign/dry-run"), true);
  assert.equal(canCall("SUPPORT", "POST notifications/campaign/send"), false);
  // MODERATOR reads course documents but cannot change them.
  assert.equal(canCall("MODERATOR", "GET training/courses/:id"), true);
  assert.equal(canCall("MODERATOR", "PUT training/courses/:id"), false);
});

test("a missing or unknown role sees and may call nothing", () => {
  assert.deepEqual(keys(null), []);
  assert.deepEqual(keys("OWNER"), []);
  assert.equal(canCall(undefined, "GET dashboard"), false);
});

test("every module needs at least one route or tab", () => {
  for (const module of CONSOLE_MODULES)
    assert.ok(module.requires.length || module.tabs?.length, module.key);
});

test("the matrix lists only known roles", () => {
  for (const [route, roles] of Object.entries(ADMIN_ROUTE_ROLES)) {
    assert.ok(roles.length, route);
    for (const role of roles) assert.ok(ROLES.includes(role), route);
  }
});

test("only ADMIN sees staff management", () => {
  for (const role of ROLES)
    assert.equal(keys(role).includes("staff"), role === "ADMIN", role);
});

test("ideas and introductions are for content moderators only", () => {
  for (const role of ROLES)
    assert.equal(
      keys(role).includes("ideas"),
      role === "ADMIN" || role === "MODERATOR",
      role,
    );
  // R1: the attendance overrides are ADMIN and MODERATOR only.
  assert.ok(keys("MODERATOR").includes("attendance"));
  assert.ok(!keys("SUPPORT").includes("attendance"));
  assert.ok(!keys("FINANCE").includes("attendance"));
});
