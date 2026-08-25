import { getExportForSession } from "@/lib/dashboard";

export async function GET() {
  const data = await getExportForSession();
  if (!data) return Response.json({ ok: false, error: "請先連結 Threads 帳號" }, { status: 401 });
  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="pulseboard-export-${new Date().toISOString().slice(0,10)}.json"`, "Cache-Control": "private, no-store" },
  });
}
