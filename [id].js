import { json, clean, requireAdmin } from "../../_lib/utils.js";

const ALLOWED = new Set(["new","contacted","approved","declined"]);

export async function onRequestGet({ request, env, params }) {
  if (!requireAdmin(request, env)) return json({ ok:false, error:"Unauthorized." }, 401);

  const item = await env.DB.prepare(`
    SELECT id, public_id, created_at, status, firm_name, contact_name,
           email, phone, territory, practice_area, lead_type,
           volume, budget, message, notes
    FROM firm_requests
    WHERE public_id = ?
    LIMIT 1
  `).bind(clean(params.id, 50)).first();

  if (!item) return json({ ok:false, error:"Request not found." }, 404);
  return json({ ok:true, request:item });
}

export async function onRequestPatch({ request, env, params }) {
  if (!requireAdmin(request, env)) return json({ ok:false, error:"Unauthorized." }, 401);

  const publicId = clean(params.id, 50);
  const body = await request.json();
  const existing = await env.DB.prepare(`
    SELECT id, status, notes FROM firm_requests
    WHERE public_id = ? LIMIT 1
  `).bind(publicId).first();

  if (!existing) return json({ ok:false, error:"Request not found." }, 404);

  const status = clean(body.status || existing.status, 30);
  if (!ALLOWED.has(status)) return json({ ok:false, error:"Invalid status." }, 400);

  const notes = clean(
    body.notes !== undefined ? body.notes : existing.notes,
    5000
  );

  await env.DB.prepare(`
    UPDATE firm_requests
    SET status = ?, notes = ?
    WHERE id = ?
  `).bind(status, notes, existing.id).run();

  return json({ ok:true });
}
