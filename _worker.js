const STATUS_VALUES = new Set([
  "new",
  "contacted",
  "qualified",
  "sent_to_firm",
  "signed",
  "closed",
  "rejected"
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function clean(value, max = 1000) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, max);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function makePublicId(prefix) {
  return `${prefix}-${crypto.randomUUID()
    .replaceAll("-", "")
    .slice(0, 12)
    .toUpperCase()}`;
}

async function hash(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const result = await crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(result)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isAdmin(request, env) {
  if (!env.ADMIN_TOKEN) return false;

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  return token === env.ADMIN_TOKEN;
}

function volumeToDaily(value) {
  const text = String(value || "");

  if (text.includes("100")) return 5;
  if (text.includes("50")) return 3;
  if (text.includes("25")) return 2;

  return 1;
}

async function health(env) {
  if (!env.DB) {
    return json({
      ok: false,
      database: false,
      error: "DB binding is missing."
    }, 500);
  }

  try {
    const tables = await env.DB.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name IN ('leads', 'law_firms')
      ORDER BY name
    `).all();

    const names = (tables.results || []).map(row => row.name);
    const ready =
      names.includes("leads") &&
      names.includes("law_firms");

    return json({
      ok: ready,
      database: true,
      schema_ready: ready,
      tables: names
    }, ready ? 200 : 503);
  } catch (error) {
    console.error("Health error:", error);

    return json({
      ok: false,
      database: true,
      schema_ready: false,
      error: "Database query failed."
    }, 500);
  }
}

async function createLead(request, env) {
  try {
    if (!env.DB) {
      return json({
        ok: false,
        error: "Database binding DB is missing."
      }, 500);
    }

    const body = await request.json();

    const fullName = clean(body.full_name, 120);
    const phone = clean(body.phone, 40);
    const email = clean(body.email, 180);
    const consent = body.consent === true;

    if (!fullName || !phone || !email) {
      return json({
        ok: false,
        error: "Name, phone, and email are required."
      }, 400);
    }

    if (!isEmail(email)) {
      return json({
        ok: false,
        error: "Please enter a valid email."
      }, 400);
    }

    if (!consent) {
      return json({
        ok: false,
        error: "Consent is required."
      }, 400);
    }

    const publicId = makePublicId("L");
    const clientIp =
      request.headers.get("CF-Connecting-IP") || "";
    const ipHash = await hash(clientIp);
    const userAgent = clean(
      request.headers.get("user-agent"),
      500
    );

    await env.DB.prepare(`
      INSERT INTO leads (
        public_id,
        injured,
        incident_type,
        state,
        accident_date,
        treatment,
        injuries,
        has_attorney,
        fault,
        description,
        full_name,
        phone,
        email,
        preferred_contact,
        consent,
        source_page,
        ip_hash,
        user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      publicId,
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

    return json({
      ok: true,
      lead_id: publicId,
      message: "Your inquiry was received."
    }, 201);
  } catch (error) {
    console.error("Create lead error:", error);

    return json({
      ok: false,
      error: "Unable to save the lead."
    }, 500);
  }
}

async function listLeads(request, env) {
  if (!isAdmin(request, env)) {
    return json({
      ok: false,
      error: "Unauthorized."
    }, 401);
  }

  const url = new URL(request.url);
  const status = clean(url.searchParams.get("status"), 40);
  const search = clean(url.searchParams.get("search"), 120);

  const conditions = [];
  const bindings = [];

  if (status && status !== "all") {
    conditions.push("status = ?");
    bindings.push(status);
  }

  if (search) {
    conditions.push(`(
      full_name LIKE ?
      OR phone LIKE ?
      OR email LIKE ?
      OR state LIKE ?
      OR incident_type LIKE ?
      OR public_id LIKE ?
    )`);

    const term = `%${search}%`;
    bindings.push(term, term, term, term, term, term);
  }

  const where = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const statement = env.DB.prepare(`
    SELECT
      public_id,
      created_at,
      updated_at,
      status,
      incident_type,
      state,
      accident_date,
      treatment,
      has_attorney,
      fault,
      full_name,
      phone,
      email,
      preferred_contact,
      assigned_firm
    FROM leads
    ${where}
    ORDER BY datetime(created_at) DESC
    LIMIT 250
  `);

  const { results } = bindings.length
    ? await statement.bind(...bindings).all()
    : await statement.all();

  const countRows = await env.DB.prepare(`
    SELECT status, COUNT(*) AS count
    FROM leads
    GROUP BY status
  `).all();

  const counts = {
    all: 0,
    new: 0,
    contacted: 0,
    qualified: 0,
    sent_to_firm: 0,
    signed: 0,
    closed: 0,
    rejected: 0
  };

  for (const row of countRows.results || []) {
    counts[row.status] = Number(row.count || 0);
    counts.all += Number(row.count || 0);
  }

  return json({
    ok: true,
    leads: results || [],
    counts
  });
}

async function getLead(request, env, publicId) {
  if (!isAdmin(request, env)) {
    return json({
      ok: false,
      error: "Unauthorized."
    }, 401);
  }

  const lead = await env.DB.prepare(`
    SELECT *
    FROM leads
    WHERE public_id = ?
    LIMIT 1
  `).bind(publicId).first();

  if (!lead) {
    return json({
      ok: false,
      error: "Lead not found."
    }, 404);
  }

  delete lead.ip_hash;

  return json({
    ok: true,
    lead
  });
}

async function updateLead(request, env, publicId) {
  if (!isAdmin(request, env)) {
    return json({
      ok: false,
      error: "Unauthorized."
    }, 401);
  }

  const body = await request.json();

  const existing = await env.DB.prepare(`
    SELECT status, notes, assigned_firm
    FROM leads
    WHERE public_id = ?
    LIMIT 1
  `).bind(publicId).first();

  if (!existing) {
    return json({
      ok: false,
      error: "Lead not found."
    }, 404);
  }

  const status = clean(
    body.status || existing.status,
    40
  );

  if (!STATUS_VALUES.has(status)) {
    return json({
      ok: false,
      error: "Invalid status."
    }, 400);
  }

  const notes = clean(
    body.notes !== undefined
      ? body.notes
      : existing.notes,
    5000
  );

  const assignedFirm = clean(
    body.assigned_firm !== undefined
      ? body.assigned_firm
      : existing.assigned_firm,
    250
  );

  await env.DB.prepare(`
    UPDATE leads
    SET
      status = ?,
      notes = ?,
      assigned_firm = ?,
      updated_at = datetime('now')
    WHERE public_id = ?
  `).bind(
    status,
    notes,
    assignedFirm,
    publicId
  ).run();

  return json({ ok: true });
}

async function createFirmRequest(request, env) {
  try {
    if (!env.DB) {
      return json({
        ok: false,
        error: "Database binding DB is missing."
      }, 500);
    }

    const body = await request.json();

    const firmName = clean(body.firm_name, 180);
    const contactName = clean(body.contact_name, 120);
    const email = clean(body.email, 180);
    const phone = clean(body.phone, 40);

    if (!firmName || !contactName || !email || !phone) {
      return json({
        ok: false,
        error: "Firm, contact, email, and phone are required."
      }, 400);
    }

    if (!isEmail(email)) {
      return json({
        ok: false,
        error: "Please enter a valid email."
      }, 400);
    }

    const territory = clean(body.territory, 500);

    const practiceAreas = [
      clean(body.practice_area, 150),
      clean(body.lead_type, 80),
      clean(body.budget, 80),
      clean(body.message, 1500)
    ].filter(Boolean).join(" | ");

    await env.DB.prepare(`
      INSERT INTO law_firms (
        firm_name,
        contact_name,
        email,
        phone,
        state,
        city,
        practice_areas,
        max_daily_leads,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      firmName,
      contactName,
      email,
      phone,
      territory,
      "",
      practiceAreas,
      volumeToDaily(body.volume),
      "pending"
    ).run();

    return json({
      ok: true,
      request_id: `F-${Date.now()}`,
      message: "Partnership request received."
    }, 201);
  } catch (error) {
    console.error("Firm request error:", error);

    return json({
      ok: false,
      error: "Unable to save the firm request."
    }, 500);
  }
}

async function listFirmRequests(request, env) {
  if (!isAdmin(request, env)) {
    return json({
      ok: false,
      error: "Unauthorized."
    }, 401);
  }

  const { results } = await env.DB.prepare(`
    SELECT
      id,
      firm_name,
      contact_name,
      email,
      phone,
      state,
      city,
      practice_areas,
      max_daily_leads,
      status,
      created_at
    FROM law_firms
    ORDER BY datetime(created_at) DESC
    LIMIT 250
  `).all();

  return json({
    ok: true,
    requests: results || []
  });
}

async function handleApi(request, env, pathname) {
  if (pathname === "/api/health" && request.method === "GET") {
    return health(env);
  }

  if (pathname === "/api/leads") {
    if (request.method === "POST") {
      return createLead(request, env);
    }

    if (request.method === "GET") {
      return listLeads(request, env);
    }
  }

  const leadMatch = pathname.match(/^\/api\/leads\/([^/]+)$/);

  if (leadMatch) {
    const publicId = decodeURIComponent(leadMatch[1]);

    if (request.method === "GET") {
      return getLead(request, env, publicId);
    }

    if (request.method === "PATCH") {
      return updateLead(request, env, publicId);
    }
  }

  if (pathname === "/api/firm-requests") {
    if (request.method === "POST") {
      return createFirmRequest(request, env);
    }

    if (request.method === "GET") {
      return listFirmRequests(request, env);
    }
  }

  return json({
    ok: false,
    error: "API route not found."
  }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url.pathname);
    }

    return env.ASSETS.fetch(request);
  }
};
