# Guards

Authorization is globally default-deny. `JwtGuard` authenticates every route that is not explicitly
public, `RolesGuard` applies optional role metadata, and `PolicyGuard` requires every controller
method to declare `@Policy(...)`.

Private-resource policies fail with `404`, not `403`, when the requester is not the job poster,
assigned worker, or conversation participant. Resource loaders attach only the minimum ownership
facts to `request.policyResource`; policy evaluation never trusts ownership values from a client.
