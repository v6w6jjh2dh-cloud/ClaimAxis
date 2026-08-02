import { json, clean, requireAdmin } from "../../_lib/utils.js";

const ALLOWED_STATUSES = new Set([
  "new", "contacted", "qualified", "sent_to_firm",
  "signed", "closed", "rejected"
]);

export async function onRequestGet({ request, env, params }) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Unauthorized." }, 401);

  const publicId = clean(params.id, 50);
  const lead = await env.DB.prepare(`
    SELECT * FROM leads WHERE public_id = ? LIMIT 1
  `).bind(publicId).first();

  if (!lead) return json({ ok: false, error: "Lead not found." }, 404);

  const events = await env.DB.prepare(`
    SELECT event_type, event_note, created_at
    FROM lead_events
    WHERE lead_id = ?
    ORDER BY datetime(created_at) DESC
  `).bind(lead.id).all();

  delete lead.ip_hash;
  return json({ ok: true, lead, events: events.results || [] });
}

export async function onRequestPatch({ request, env, params }) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Unauthorized." }, 401);

  const publicId = clean(params.id, 50);
  const body = await request.json();
  const existing = await env.DB.prepare(`
    SELECT id, status, notes, assigned_firm
    FROM leads WHERE public_id = ? LIMIT 1
  `).bind(publicId).first();

  if (!existing) return json({ ok: false, error: "Lead not found." }, 404);

  const status = clean(body.status || existing.status, 30);
  if (!ALLOWED_STATUSES.has(status)) {
    return json({ ok: false, error: "Invalid status." }, 400);
  }

  const notes = clean(
    body.notes !== undefined ? body.notes : existing.notes,
    5000
  );
  const assignedFirm = clean(
    body.assigned_firm !== undefined ? body.assigned_firm : existing.assigned_firm,
    250
  );

  await env.DB.prepare(`
    UPDATE leads
    SET status = ?, notes = ?, assigned_firm = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(status, notes, assignedFirm, existing.id).run();

  if (status !== existing.status) {
    await env.DB.prepare(`
      INSERT INTO lead_events (lead_id, event_type, event_note)
      VALUES (?, 'status_changed', ?)
    `).bind(existing.id, `Status changed from ${existing.status} to ${status}`).run();
  }

  return json({ ok: true });
}
