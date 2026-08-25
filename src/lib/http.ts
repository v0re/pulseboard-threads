export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin;
}

export function jsonError(message: string, status: number): Response {
  return Response.json({ ok: false, error: message }, { status });
}
