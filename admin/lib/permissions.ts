import {
  ADMIN_ROUTE_ROLES,
  type AdminRole,
  type AdminRoute,
} from "./admin-route-roles.ts";

export type { AdminRole, AdminRoute };

/**
 * Whether `role` may call `route` ("METHOD path" under /api/v1/admin/).
 * The answer comes from ADMIN_ROUTE_ROLES, which is generated from the
 * backend's @AdminRoles decorators; the server still enforces every call.
 */
export function canCall(
  role: string | null | undefined,
  route: AdminRoute,
): boolean {
  const roles: readonly string[] = ADMIN_ROUTE_ROLES[route];
  return !!role && roles.includes(role);
}

export function canCallAll(
  role: string | null | undefined,
  routes: readonly AdminRoute[],
): boolean {
  return routes.every((route) => canCall(role, route));
}

type Gated<K extends string> = {
  key: K;
  name: string;
  note: string;
  /** The read the view needs; the view is shown only to roles that may. */
  requires: readonly AdminRoute[];
};

export type ModuleKey =
  | "dashboard"
  | "users"
  | "reports"
  | "risk"
  | "jobs"
  | "applications"
  | "verification"
  | "categories"
  | "skills"
  | "locations"
  | "config"
  | "flags"
  | "disputes"
  | "subscriptions"
  | "jobPayments"
  | "notifications"
  | "analytics"
  | "learn"
  | "business"
  | "community"
  | "ideas"
  | "attendance"
  | "staff"
  | "aiUsage"
  | "audit";

export type ConsoleModule = Gated<ModuleKey> & {
  tabs?: ReadonlyArray<Gated<string>>;
};

export const CONSOLE_MODULES: readonly ConsoleModule[] = [
  {
    key: "dashboard",
    name: "Dashboard",
    note: "Live marketplace health",
    requires: ["GET dashboard"],
  },
  {
    key: "users",
    name: "Users",
    note: "Support and moderation",
    requires: ["GET users"],
  },
  {
    key: "reports",
    name: "Safety reports",
    note: "Human review and progressive action",
    requires: ["GET reports"],
  },
  {
    key: "risk",
    name: "Risk review",
    note: "Deterministic signals, human decisions only",
    requires: ["GET risk/items"],
  },
  {
    key: "jobs",
    name: "Jobs",
    note: "Lifecycle rescue",
    requires: ["GET jobs"],
  },
  {
    key: "applications",
    name: "Applications",
    note: "Unstick applications",
    requires: ["GET applications"],
  },
  {
    key: "verification",
    name: "Verification",
    note: "Document review queue",
    requires: ["GET verification-requests"],
  },
  {
    key: "categories",
    name: "Categories",
    note: "D12 safety policies",
    requires: ["GET categories"],
  },
  {
    key: "skills",
    name: "Skills",
    note: "Skills under each work category",
    requires: ["GET skills", "GET categories"],
  },
  {
    key: "locations",
    name: "Locations",
    note: "Launch service areas",
    requires: ["GET locations"],
  },
  {
    key: "config",
    name: "Configuration",
    note: "Preview and revert",
    requires: ["GET config"],
  },
  {
    key: "flags",
    name: "Feature flags",
    note: "Percentage rollouts",
    requires: ["GET flags"],
  },
  {
    key: "disputes",
    name: "Disputes",
    note: "Evidence and resolution",
    requires: ["GET disputes"],
  },
  {
    key: "subscriptions",
    name: "Subscriptions",
    note: "Plans and operator access",
    requires: ["GET subscriptions/overview", "GET subscriptions"],
  },
  {
    key: "jobPayments",
    name: "Job payments",
    note: "Offline cash payment oversight",
    requires: ["GET job-payments/overview"],
  },
  {
    key: "notifications",
    name: "Notifications",
    note: "Campaign dry-runs",
    requires: ["POST notifications/campaign/dry-run"],
  },
  {
    key: "analytics",
    name: "Analytics",
    note: "Marketplace health",
    requires: ["GET analytics"],
  },
  {
    key: "learn",
    name: "Learn",
    note: "Mentors, learning and courses",
    requires: [],
    tabs: [
      {
        key: "mentors",
        name: "Mentor applications",
        note: "",
        requires: ["GET verification-requests"],
      },
      {
        key: "opportunities",
        name: "Learning opportunities",
        note: "",
        requires: ["GET learning-opportunities"],
      },
      {
        key: "courses",
        name: "Courses",
        note: "",
        requires: ["GET training/courses"],
      },
      {
        key: "certificates",
        name: "Completion records",
        note: "",
        requires: ["GET certificates"],
      },
      {
        key: "mentorList",
        name: "Mentors",
        note: "",
        requires: ["GET mentors"],
      },
    ],
  },
  {
    key: "business",
    name: "Business",
    note: "Sectors, business verification and content",
    requires: [],
    tabs: [
      {
        key: "verification",
        name: "Business verification",
        note: "",
        requires: ["GET verification-requests"],
      },
      {
        key: "directory",
        name: "Businesses",
        note: "",
        requires: ["GET businesses"],
      },
      {
        key: "sectors",
        name: "Sectors",
        note: "",
        requires: ["GET business-categories"],
      },
    ],
  },
  {
    key: "community",
    name: "Community",
    note: "Groups, sessions, events and ambassadors",
    requires: [],
    tabs: [
      {
        key: "groups",
        name: "Groups",
        note: "",
        requires: ["GET community/groups"],
      },
      {
        key: "sessions",
        name: "Sessions and events",
        note: "",
        requires: ["GET sessions"],
      },
      {
        key: "ambassadors",
        name: "Ambassadors",
        note: "",
        requires: ["GET community/ambassadors"],
      },
    ],
  },
  {
    key: "ideas",
    name: "Ideas and introductions",
    note: "Shared ideas and introduction requests",
    requires: [],
    tabs: [
      { key: "ideas", name: "Ideas", note: "", requires: ["GET ideas"] },
      {
        key: "introductions",
        name: "Introductions",
        note: "",
        requires: ["GET introductions"],
      },
    ],
  },
  {
    key: "attendance",
    name: "Attendance",
    note: "Check-in and check-out overrides",
    requires: ["GET attendance"],
  },
  {
    key: "staff",
    name: "Staff",
    note: "Invite, change roles and deactivate operators",
    requires: ["GET staff"],
  },
  {
    key: "aiUsage",
    name: "AI usage",
    note: "Calls, estimated cost and daily caps",
    requires: ["GET ai/usage"],
  },
  {
    key: "audit",
    name: "Audit trail",
    note: "Who changed what",
    requires: ["GET audit-logs"],
  },
];

/** Tabs of a module this role can open. */
export function visibleTabs(
  role: string | null | undefined,
  module: ConsoleModule,
): ReadonlyArray<Gated<string>> {
  return (module.tabs ?? []).filter((tab) => canCallAll(role, tab.requires));
}

/** Sidebar modules for this role: its reads are allowed (and, for tabbed
 * modules, at least one tab is). */
export function visibleModules(
  role: string | null | undefined,
): ConsoleModule[] {
  return CONSOLE_MODULES.filter(
    (module) =>
      canCallAll(role, module.requires) &&
      (!module.tabs || visibleTabs(role, module).length > 0),
  );
}
