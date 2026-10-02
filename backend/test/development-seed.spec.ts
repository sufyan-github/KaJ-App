describe("development seed production safety", () => {
  const originalEnvironment = process.env.NODE_ENV;

  afterEach(() => {
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
    jest.dontMock("@prisma/client");
    jest.resetModules();
  });

  it.each(["production", "staging", "", undefined])(
    "rejects environment %s before creating a database client",
    (environment) => {
      if (environment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = environment;
      const client = jest.fn();
      jest.doMock("@prisma/client", () => ({ PrismaClient: client }));
      expect(() =>
        jest.isolateModules(() => require("../prisma/seed")),
      ).toThrow("Development seed requires NODE_ENV=development or test");
      expect(client).not.toHaveBeenCalled();
    },
  );
});
