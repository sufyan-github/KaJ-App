import { randomUUID } from "node:crypto";
import { RoleMode } from "@prisma/client";

import { PolicyResourceResolver } from "../src/common/policy/policy-resource.resolver";
import { Policies } from "../src/common/policy/policy.types";
import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/** P1.0: ownership is declared on routes and resolved by the policy guard. */
databaseDescribe("resource ownership policies (real HTTP)", () => {
  let api: HttpHarness;
  let poster: Actor;
  let worker: Actor;
  let stranger: Actor;
  let jobId: string;
  let applicationId: string;
  let assignmentId: string;
  let conversationId: string;

  beforeAll(async () => {
    api = await HttpHarness.start();
    poster = await api.actor([RoleMode.CUSTOMER]);
    worker = await api.actor([RoleMode.WORKER]);
    // Has every role, so only ownership can refuse it.
    stranger = await api.actor([
      RoleMode.CUSTOMER,
      RoleMode.WORKER,
      RoleMode.BUSINESS,
    ]);
    jobId = await api.openJob(poster);
    applicationId = await api.apply(jobId, worker);
    conversationId = (
      await api
        .post(`jobs/${jobId}/conversations`, worker, {
          participantUserId: poster.id,
        })
        .expect(201)
    ).body.data.id;
    assignmentId = (
      await api.post(`applications/${applicationId}/accept`, poster).expect(201)
    ).body.data.id;
  });

  afterAll(async () => {
    await api?.close();
  });

  it("resolves the owners of each kind of record", async () => {
    const resolver = api.app.get(PolicyResourceResolver);
    await expect(
      resolver.resolve(
        [
          Policies.jobPoster({ source: "assignment" }),
          Policies.assignedWorker(),
        ],
        { id: assignmentId },
      ),
    ).resolves.toEqual({ jobPosterId: poster.id, assignedWorkerId: worker.id });
    await expect(
      resolver.resolve([Policies.conversationParticipant()], {
        id: conversationId,
      }),
    ).resolves.toEqual({
      conversationParticipantIds: expect.arrayContaining([
        poster.id,
        worker.id,
      ]),
    });
    await expect(
      resolver.resolve([Policies.jobPoster()], { id: randomUUID() }),
    ).resolves.toEqual({});
    await expect(
      resolver.resolve([Policies.jobPoster()], { id: "nope" }),
    ).resolves.toBeUndefined();
  });

  it.each([
    ["get", () => `jobs/${jobId}/applications`],
    ["get", () => `jobs/${jobId}/suggested-workers`],
    ["post", () => `jobs/${jobId}/publish`],
    ["post", () => `applications/${applicationId}/accept`],
    ["post", () => `assignments/${assignmentId}/confirm`],
    ["post", () => `assignments/${assignmentId}/complete`],
    ["get", () => `conversations/${conversationId}/messages`],
    ["post", () => `conversations/${conversationId}/read`],
  ] as const)("answers a stranger 404 (route %#)", async (method, path) => {
    const response =
      method === "get"
        ? await api.get(path(), stranger)
        : await api.post(path(), stranger, {});
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("still lets the owners through", async () => {
    await api.get(`jobs/${jobId}/applications`, poster).expect(200);
    await api
      .get(`conversations/${conversationId}/messages`, worker)
      .expect(200);
    await api.post(`assignments/${assignmentId}/confirm`, worker).expect(201);
  });

  it("keeps 400 for a malformed id and 404 for an unknown one", async () => {
    await api.get("jobs/not-a-uuid/applications", poster).expect(400);
    await api.get(`jobs/${randomUUID()}/applications`, poster).expect(404);
  });
});
