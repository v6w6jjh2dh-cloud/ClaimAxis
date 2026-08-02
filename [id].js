import { json, clean, requireAdmin } from "../../_lib/utils.js";

const statuses = new Set([
  "new","contacted","qualified","sent_to_firm",
  "signed","closed","rejected"
]);

export async function onRequestGet({ request, env, params }) {
  if (!requireAdmin(request, env)) {
    return json({ ok:false, error:"Unauthorized." }, 401);
  }

  const lead = await env.DB.prepare(`
    SELECT *
    FROM leads
    WHERE public_id = ?
    LIMIT 1
  `).bind(clean(params.id, 60)).first();

  if (!lead) return json({ ok:false, error:"Lead not found." }, 404);
  delete lead.ip_hash;
  return json({ ok:true, lead });
}

export async function onRequestPatch({ request, env, params }) {
  if (!requireAdmin(request, env)) {
    return json({ ok:false, error:"Unauthorized." }, 401);
  }

  const id = clean(params.id, 60);
  const body = await request.json();

  const lead = await env.DB.prepare(`
    SELECT status, notes, assigned_firm
    FROM leads
    WHERE public_id = ?
    LIMIT 1
  `).bind(id).first();

  if (!lead) return json({ ok:false, error:"Lead not found." }, 404);

  const status = clean(body.status || lead.status, 40);
  if (!statuses.has(status)) {
    return json({ ok:false, error:"Invalid status." }, 400);
  }

  const notes = clean(
    body.notes !== undefined ? body.notes : lead.notes,
    5000
  );

  const assignedFirm = clean(
    body.assigned_firm !== undefined ? body.assigned_firm : lead.assigned_firm,
    250
  );

  await env.DB.prepare(`
    UPDATE leads
    SET status = ?, notes = ?, assigned_firm = ?, updated_at = datetime('now')
    WHERE public_id = ?
  `).bind(status, notes, assignedFirm, id).run();

  return json({ ok:true });
}
