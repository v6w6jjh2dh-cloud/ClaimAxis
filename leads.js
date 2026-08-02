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

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return json({ ok: false, error: "JSON body required." }, 415);
    }

    const body = await request.json();

    const fullName = clean(body.full_name, 120);
    const phone = clean(body.phone, 40);
    const email = clean(body.email, 180);
    const consent = body.consent === true || body.consent === "true" || body.consent === "on";

    if (!fullName || !phone || !email) {
      return json({ ok: false, error: "Name, phone, and email are required." }, 400);
    }
    if (!isEmail(email)) {
      return json({ ok: false, error: "Please enter a valid email address." }, 400);
    }
    if (!consent) {
      return json({ ok: false, error: "Consent is required." }, 400);
    }

    const publicId = newPublicId("L");
    const ipHash = await sha256(getClientIp(request));
    const userAgent = clean(request.headers.get("user-agent"), 500);

    const result = await env.DB.prepare(`
      INSERT INTO leads (
        public_id, injured, incident_type, state, accident_date,
        treatment, injuries, has_attorney, fault, description,
        full_name, phone, email, preferred_contact, consent,
        source_page, ip_hash, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      publicId,
      clean(body.injured, 20),
      clean(body.incident_type, 100),
      clean(body.state, 100),
      clean(body.accident_date, 30),
      clean(body.treatment, 120),
      clean(body.injuries, 2500),
      clean(body.has_attorney, 20),
      clean(body.fault, 120),
      clean(body.description, 5000),
      fullName,
      phone,
      email,
      clean(body.preferred_contact, 50),
      consent ? 1 : 0,
      "case-review",
      ipHash,
      userAgent
    ).run();

    if (!result.success) {
      return json({ ok: false, error: "Unable to save the lead." }, 500);
    }

    await env.DB.prepare(`
      INSERT INTO lead_events (lead_id, event_type, event_note)
      VALUES (?, 'created', 'Lead submitted from website')
    `).bind(result.meta.last_row_id).run();

    return json({
      ok: true,
      lead_id: publicId,
      message: "Your inquiry was received."
    }, 201);
  } catch (error) {
    console.error("Lead submit error:", error);
    return json({ ok: false, error: "Unexpected server error." }, 500);
  }
}

export async function onRequestGet({ request, env }) {
  if (!requireAdmin(request, env)) {
    return json({ ok: false, error: "Unauthorized." }, 401);
  }

  const url = new URL(request.url);
  const status = clean(url.searchParams.get("status"), 30);
  const search = clean(url.searchParams.get("search"), 120);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 250);

  const conditions = [];
  const bindings = [];

  if (status && status !== "all") {
    conditions.push("status = ?");
    bindings.push(status);
  }
  if (search) {
    conditions.push(`(
      full_name LIKE ? OR phone LIKE ? OR email LIKE ? OR
      state LIKE ? OR incident_type LIKE ? OR public_id LIKE ?
    )`);
    const term = `%${search}%`;
    bindings.push(term, term, term, term, term, term);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const stmt = env.DB.prepare(`
    SELECT
      id, public_id, created_at, updated_at, status,
      incident_type, state, accident_date, treatment,
      has_attorney, fault, full_name, phone, email,
      preferred_contact, assigned_firm
    FROM leads
    ${where}
    ORDER BY datetime(created_at) DESC
    LIMIT ?
  `).bind(...bindings, limit);

  const { results } = await stmt.all();

  const countsResult = await env.DB.prepare(`
    SELECT status, COUNT(*) AS count
    FROM leads
    GROUP BY status
  `).all();

  const counts = {
    all: 0, new: 0, contacted: 0, qualified: 0,
    sent_to_firm: 0, signed: 0, closed: 0, rejected: 0
  };
  for (const row of countsResult.results || []) {
    counts[row.status] = Number(row.count || 0);
    counts.all += Number(row.count || 0);
  }

  return json({ ok: true, leads: results || [], counts });
}
