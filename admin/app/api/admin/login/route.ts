import { backendRequest, proxyJson } from "@/lib/backend";

export async function POST(request: Request) {
  const response = await backendRequest("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify(await request.json()),
  });
  return proxyJson(response);
}
