import {
  json, clean, isEmail, newPublicId, sha256,
  getClientIp, requireAdmin, corsHeaders
} from "../_lib/utils.js";

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) return json({ ok: false, error: "D1 binding DB is missing." }, 500);
    const body = await request.json();

    const firmName = clean(body.firm_name, 180);
    const contactName = clean(body.contact_name, 120);
    const email = clean(body.email, 180);
    const phone = clean(body.phone, 40);

    if (!firmName || !contactName || !email || !phone) {
      return json({ ok: false, error: "Firm, contact, email, and phone are required." }, 400);
    }
    if (!isEmail(email)) {
      return json({ ok: false, error: "Please enter a valid email address." }, 400);
    }

    const publicId = newPublicId("F");
    const ipHash = await sha256(getClientIp(request));
    const userAgent = clean(request.headers.get("user-agent"), 500);

    const result = await env.DB.prepare(`
      INSERT INTO firm_requests (
        public_id, firm_name, contact_name, email, phone,
        territory, practice_area, lead_type, volume, budget,
        message, ip_hash, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      publicId, firmName, contactName, email, phone,
      clean(body.territory, 500),
      clean(body.practice_area, 150),
      clean(body.lead_type, 80),
      clean(body.volume, 80),
      clean(body.budget, 80),
      clean(body.message, 3000),
      ipHash, userAgent
    ).run();

    if (!result.success) return json({ ok: false, error: "Unable to save request." }, 500);

    return json({
      ok: true,
      request_id: publicId,
      message: "Partnership request received."
    }, 201);
  } catch (error) {
    console.error("Firm request error:", error);
    return json({ ok: false, error: "Unexpected server error." }, 500);
  }
}

export async function onRequestGet({ request, env }) {
  if (!requireAdmin(request, env)) return json({ ok: false, error: "Unauthorized." }, 401);

  const { results } = await env.DB.prepare(`
    SELECT
      public_id, created_at, status, firm_name, contact_name,
      email, phone, territory, practice_area, lead_type, volume, budget
    FROM firm_requests
    ORDER BY datetime(created_at) DESC
    LIMIT 250
  `).all();

  return json({ ok: true, requests: results || [] });
}
