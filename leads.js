import { json, clean, isEmail, publicId, hash, requireAdmin } from "../_lib/utils.js";

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) return json({ ok:false, error:"Database binding DB is missing." }, 500);

    const body = await request.json();
    const fullName = clean(body.full_name, 120);
    const phone = clean(body.phone, 40);
    const email = clean(body.email, 180);
    const consent = body.consent === true;

    if (!fullName || !phone || !email) {
      return json({ ok:false, error:"Name, phone, and email are required." }, 400);
    }
    if (!isEmail(email)) {
      return json({ ok:false, error:"Please enter a valid email." }, 400);
    }
    if (!consent) {
      return json({ ok:false, error:"Consent is required." }, 400);
    }

    const id = publicId("L");
    const ip = request.headers.get("CF-Connecting-IP") || "";
    const ipHash = await hash(ip);
    const userAgent = clean(request.headers.get("user-agent"), 500);

    await env.DB.prepare(`
      INSERT INTO leads (
        public_id, injured, incident_type, state, accident_date,
        treatment, injuries, has_attorney, fault, description,
        full_name, phone, email, preferred_contact, consent,
        source_page, ip_hash, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      clean(body.injured, 20),
      clean(body.incident_type, 100),
      clean(body.state, 100),
      clean(body.accident_date, 30),
      clean(body.treatment, 150),
      clean(body.injuries, 2500),
      clean(body.has_attorney, 20),
      clean(body.fault, 120),
      clean(body.description, 5000),
      fullName,
      phone,
      email,
      clean(body.preferred_contact, 50),
      1,
      "case-review",
      ipHash,
      userAgent
    ).run();

    return json({ ok:true, lead_id:id }, 201);
  } catch (error) {
    console.error(error);
    return json({ ok:false, error:"Unable to save the lead." }, 500);
  }
}

export async function onRequestGet({ request, env }) {
  if (!requireAdmin(request, env)) {
    return json({ ok:false, error:"Unauthorized." }, 401);
  }

  const url = new URL(request.url);
  const status = clean(url.searchParams.get("status"), 40);
  const search = clean(url.searchParams.get("search"), 120);

  const where = [];
  const binds = [];

  if (status && status !== "all") {
    where.push("status = ?");
    binds.push(status);
  }

  if (search) {
    where.push(`(
      full_name LIKE ? OR phone LIKE ? OR email LIKE ?
      OR state LIKE ? OR incident_type LIKE ? OR public_id LIKE ?
    )`);
    const term = `%${search}%`;
    binds.push(term, term, term, term, term, term);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const { results } = await env.DB.prepare(`
    SELECT public_id, created_at, updated_at, status, incident_type,
           state, accident_date, treatment, has_attorney, fault,
           full_name, phone, email, preferred_contact, assigned_firm
    FROM leads
    ${clause}
    ORDER BY datetime(created_at) DESC
    LIMIT 250
  `).bind(...binds).all();

  const countRows = await env.DB.prepare(`
    SELECT status, COUNT(*) count
    FROM leads
    GROUP BY status
  `).all();

  const counts = {
    all:0, new:0, contacted:0, qualified:0,
    sent_to_firm:0, signed:0, closed:0, rejected:0
  };

  for (const row of countRows.results || []) {
    counts[row.status] = Number(row.count || 0);
    counts.all += Number(row.count || 0);
  }

  return json({ ok:true, leads:results || [], counts });
}
