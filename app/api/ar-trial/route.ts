import { env } from "cloudflare:workers";
import { database } from "@/db/raw";
export const dynamic = "force-dynamic";
type Team = { id: string; name: string; token: string };
type Trial = { id: string; admin_hash: string; label: string; teams: string; winner: string | null; claimed_at: number | null };
const secret = () => crypto.randomUUID().replaceAll("-", "");
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map(n => n.toString(16).padStart(2, "0")).join("");
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
class TrialError extends Error { constructor(message: string, public status = 400) { super(message); } }
function fail(message: string, status = 400): never { throw new TrialError(message, status); }
const error = (e: unknown) => json({ error: e instanceof TrialError ? e.message : "저장소에 연결하지 못했습니다. 잠시 뒤 다시 시도하세요." }, e instanceof TrialError ? e.status : 500);
async function authorized(req: Request, id: string) {
  if (!/^[a-f0-9]{32}$/.test(id)) fail("테스트 링크가 올바르지 않습니다.", 404);
  const row = await database().prepare("SELECT * FROM ar_trials WHERE id = ?").bind(id).first<Trial>();
  if (!row) fail("테스트를 찾지 못했습니다.", 404);
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const admin = await hash(token) === row.admin_hash;
  const teams: Team[] = JSON.parse(row.teams);
  const team = teams.find(t => t.token === token);
  if (!admin && !team) fail("교사 또는 모둠 참여 링크로 접속하세요.", 403);
  return { row, admin, teams, team };
}
function view(a: Awaited<ReturnType<typeof authorized>>) {
  return { id: a.row.id, label: a.row.label, role: a.admin ? "admin" : "team", teamId: a.team?.id,
    teams: a.admin ? a.teams : a.teams.filter(t => t.id === a.team?.id).map(({ token: _, ...t }) => t),
    winner: a.row.winner, winnerName: a.teams.find(t => t.id === a.row.winner)?.name || null,
    claimedAt: a.row.claimed_at, value: "7", shape: "└" };
}
export async function GET(req: Request) {
  try {
    const url = new URL(req.url), a = await authorized(req, url.searchParams.get("id") || "");
    const asset = url.searchParams.get("asset");
    if (asset) {
      if (asset !== "target" && asset !== "photo") fail("잘못된 파일 요청입니다.");
      const object = await env.BUCKET?.get(`ar-trials/${a.row.id}/${asset}`);
      if (!object) fail("인식 파일을 찾지 못했습니다.", 404);
      return new Response(object.body, { headers: { "Content-Type": asset === "photo" ? "image/jpeg" : "application/octet-stream", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }
    return json(view(a));
  } catch (e) { return error(e); }
}
export async function POST(req: Request) {
  try {
    if (req.headers.get("origin") && req.headers.get("origin") !== new URL(req.url).origin) fail("허용되지 않은 요청입니다.", 403);
    const action = new URL(req.url).searchParams.get("action");
    if (action === "create") {
      if (Number(req.headers.get("content-length") || 0) > 8_000_000) fail("사진 파일이 너무 큽니다.", 413);
      // Bound the body even for requests without Content-Length.
      const reader = req.body?.getReader(); if (!reader) fail("사진을 등록하세요.");
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length;
        if (size > 8_000_000) { await reader.cancel(); fail("인식 파일이 너무 큽니다.", 413); } chunks.push(next.value); }
      const body = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
      const form = await new Response(body, { headers: { "Content-Type": req.headers.get("content-type") || "" } }).formData();
      const target = form.get("target"), photo = form.get("photo"), label = form.get("label");
      if (!(target instanceof File) || target.size < 100 || target.size > 6_000_000 || !(photo instanceof File) || photo.size > 1_000_000) fail("인식 사진을 다시 등록하세요.");
      if (typeof label !== "string" || !label.trim() || label.length > 50) fail("물건 이름은 1~50자로 입력하세요.");
      if (!env.BUCKET) fail("사진 저장소를 준비 중입니다.", 503);
      const id = secret(), adminToken = secret();
      const teams: Team[] = Array.from({ length: 5 }, (_, i) => ({ id: `t${i + 1}`, name: `${i + 1}모둠`, token: secret() }));
      await env.BUCKET.put(`ar-trials/${id}/target`, await target.arrayBuffer());
      await env.BUCKET.put(`ar-trials/${id}/photo`, await photo.arrayBuffer(), { httpMetadata: { contentType: "image/jpeg" } });
      try {
        await database().prepare("INSERT INTO ar_trials (id, admin_hash, label, teams, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, await hash(adminToken), label.trim(), JSON.stringify(teams), Date.now()).run();
      } catch (e) { await env.BUCKET.delete([`ar-trials/${id}/target`, `ar-trials/${id}/photo`]); throw e; }
      return json({ id, adminToken });
    }
    const raw = await req.text(); if (raw.length > 1000) fail("요청이 너무 큽니다.", 413);
    const body = JSON.parse(raw), a = await authorized(req, body.id || "");
    if (action === "claim") {
      if (!a.team || a.admin) fail("모둠 링크에서 획득하세요.", 403);
      const result = await database().prepare("UPDATE ar_trials SET winner = ?, claimed_at = ? WHERE id = ? AND winner IS NULL").bind(a.team.id, Date.now(), a.row.id).run();
      const latest = await authorized(req, a.row.id);
      if (!result.meta.changes && latest.row.winner !== a.team.id) return json({ ...view(latest), error: "다른 모둠이 먼저 획득했습니다." }, 409);
      return json(view(latest));
    }
    if (action === "reset") {
      if (!a.admin) fail("교사만 다시 숨길 수 있습니다.", 403);
      await database().prepare("UPDATE ar_trials SET winner = NULL, claimed_at = NULL WHERE id = ?").bind(a.row.id).run();
      return json(view(await authorized(req, a.row.id)));
    }
    fail("지원하지 않는 동작입니다.");
  } catch (e) { return error(e); }
}
