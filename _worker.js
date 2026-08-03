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

function emailEscape(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

async function sendEmail(env, { to, subject, html, replyTo }) {
  if (!env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY is missing; email skipped.");
    return { ok: false, skipped: true };
  }

  const recipients = Array.isArray(to) ? to : [to];
  const payload = {
    from: "ClaimAxis Leads <leads@claimaxis.com>",
    to: recipients,
    subject,
    html
  };

  if (replyTo) payload.reply_to = replyTo;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("Resend error:", response.status, result);
    return { ok: false, status: response.status, result };
  }

  return { ok: true, result };
}

async function sendLeadEmails(env, lead) {
  const dashboardUrl = "https://claimaxis.com/dashboard.html";
  const adminEmail = env.NOTIFICATION_EMAIL || "claimaxis.business@gmail.com";

  const adminHtml = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0b1b2b;max-width:680px;margin:auto">
      <h2 style="margin-bottom:8px">New ClaimAxis Lead</h2>
      <p style="margin-top:0;color:#526477">A new injury intake was submitted.</p>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Reference</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${emailEscape(lead.publicId)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Name</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${emailEscape(lead.fullName)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Phone</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${emailEscape(lead.phone)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Email</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${emailEscape(lead.email)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>State</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${emailEscape(lead.state || "—")}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Incident</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${emailEscape(lead.incidentType || "—")}</td></tr>
      </table>
      <p style="margin-top:24px"><a href="${dashboardUrl}" style="background:#d9aa43;color:#071526;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Open Dashboard</a></p>
    </div>`;

  const customerHtml = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0b1b2b;max-width:680px;margin:auto">
      <h2>We received your inquiry</h2>
      <p>Hello ${emailEscape(lead.fullName)},</p>
      <p>Thank you for contacting ClaimAxis. Your information was received securely and is being reviewed.</p>
      <p><strong>Reference:</strong> ${emailEscape(lead.publicId)}</p>
      <p>A member of our intake team may contact you using your preferred contact method.</p>
      <p style="color:#6b7280;font-size:13px">Submitting an inquiry does not create an attorney-client relationship and does not guarantee representation.</p>
    </div>`;

  return Promise.allSettled([
    sendEmail(env, {
      to: adminEmail,
      subject: `New Lead: ${lead.fullName} (${lead.publicId})`,
      html: adminHtml,
      replyTo: lead.email
    }),
    sendEmail(env, {
      to: lead.email,
      subject: `ClaimAxis received your inquiry — ${lead.publicId}`,
      html: customerHtml
    })
  ]);
}

async function sendFirmRequestEmail(env, firm) {
  const adminEmail = env.NOTIFICATION_EMAIL || "claimaxis.business@gmail.com";
  const dashboardUrl = "https://claimaxis.com/dashboard.html";

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0b1b2b;max-width:680px;margin:auto">
      <h2>New Law Firm Request</h2>
      <p><strong>Firm:</strong> ${emailEscape(firm.firmName)}</p>
      <p><strong>Contact:</strong> ${emailEscape(firm.contactName)}</p>
      <p><strong>Email:</strong> ${emailEscape(firm.email)}</p>
      <p><strong>Phone:</strong> ${emailEscape(firm.phone)}</p>
      <p><strong>Territory:</strong> ${emailEscape(firm.territory || "—")}</p>
      <p><strong>Practice details:</strong> ${emailEscape(firm.practiceAreas || "—")}</p>
      <p><a href="${dashboardUrl}" style="background:#d9aa43;color:#071526;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Open Dashboard</a></p>
    </div>`;

  return sendEmail(env, {
    to: adminEmail,
    subject: `New Firm Request: ${firm.firmName}`,
    html,
    replyTo: firm.email
  });
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

    await sendLeadEmails(env, {
      publicId,
      fullName,
      phone,
      email,
      state: clean(body.state, 100),
      incidentType: clean(body.incident_type, 100)
    });

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


async function sendLeadToFirm(request, env, publicId) {
  if (!isAdmin(request, env)) {
    return json({ ok: false, error: "Unauthorized." }, 401);
  }

  const body = await request.json().catch(() => ({}));
  const firmId = Number(body.firm_id);
  if (!Number.isInteger(firmId) || firmId < 1) {
    return json({ ok: false, error: "Please select a valid law firm." }, 400);
  }

  const lead = await env.DB.prepare(`
    SELECT * FROM leads WHERE public_id = ? LIMIT 1
  `).bind(publicId).first();
  if (!lead) return json({ ok: false, error: "Lead not found." }, 404);

  const firm = await env.DB.prepare(`
    SELECT * FROM law_firms WHERE id = ? LIMIT 1
  `).bind(firmId).first();
  if (!firm) return json({ ok: false, error: "Law firm not found." }, 404);
  if (String(firm.status || "").toLowerCase() !== "active") {
    return json({ ok: false, error: "This law firm is not active." }, 400);
  }
  if (!firm.email || !isEmail(firm.email)) {
    return json({ ok: false, error: "This law firm does not have a valid email address." }, 400);
  }

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0b1b2b;max-width:720px;margin:auto">
      <h2>New ClaimAxis Lead</h2>
      <p>Hello ${emailEscape(firm.contact_name || firm.firm_name)},</p>
      <p>ClaimAxis has assigned a new lead to <strong>${emailEscape(firm.firm_name)}</strong>.</p>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Reference</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${emailEscape(lead.public_id)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Name</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${emailEscape(lead.full_name)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Phone</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${emailEscape(lead.phone)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Email</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${emailEscape(lead.email)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>State</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${emailEscape(lead.state || "—")}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Incident</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${emailEscape(lead.incident_type || "—")}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Accident date</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${emailEscape(lead.accident_date || "—")}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Injuries</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${emailEscape(lead.injuries || "—")}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Description</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${emailEscape(lead.description || "—")}</td></tr>
      </table>
      <p style="color:#6b7280;font-size:13px">Please contact the lead promptly and handle all information securely.</p>
    </div>`;

  const sent = await sendEmail(env, {
    to: firm.email,
    subject: `New ClaimAxis Lead: ${lead.full_name} (${lead.public_id})`,
    html,
    replyTo: lead.email
  });

  if (!sent.ok) {
    return json({ ok: false, error: "The lead was not sent. Please check the Resend configuration." }, 502);
  }

  await env.DB.prepare(`
    UPDATE leads
    SET status = 'sent_to_firm', assigned_firm = ?, updated_at = datetime('now')
    WHERE public_id = ?
  `).bind(firm.firm_name, publicId).run();

  return json({
    ok: true,
    message: `Lead sent to ${firm.firm_name}.`,
    firm: { id: firm.id, firm_name: firm.firm_name, email: firm.email }
  });
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

    await sendFirmRequestEmail(env, {
      firmName,
      contactName,
      email,
      phone,
      territory,
      practiceAreas
    });

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
    WHERE status = 'pending'
    ORDER BY datetime(created_at) DESC
    LIMIT 250
  `).all();

  return json({
    ok: true,
    requests: results || []
  });
}


const LAW_FIRM_STATUSES = new Set(["active", "pending", "paused", "declined"]);

async function listLawFirms(request, env) {
  if (!isAdmin(request, env)) {
    return json({ ok: false, error: "Unauthorized." }, 401);
  }

  const url = new URL(request.url);
  const status = clean(url.searchParams.get("status"), 30);
  const onlyActive = status === "active";

  const statement = onlyActive
    ? env.DB.prepare(`
        SELECT id, firm_name, contact_name, email, phone, state, city,
               practice_areas, max_daily_leads, status, created_at
        FROM law_firms
        WHERE status = 'active'
        ORDER BY firm_name COLLATE NOCASE ASC
        LIMIT 500
      `)
    : env.DB.prepare(`
        SELECT id, firm_name, contact_name, email, phone, state, city,
               practice_areas, max_daily_leads, status, created_at
        FROM law_firms
        ORDER BY datetime(created_at) DESC, firm_name COLLATE NOCASE ASC
        LIMIT 500
      `);

  const { results } = await statement.all();
  return json({ ok: true, firms: results || [] });
}

async function createLawFirm(request, env) {
  if (!isAdmin(request, env)) {
    return json({ ok: false, error: "Unauthorized." }, 401);
  }

  const body = await request.json();
  const firmName = clean(body.firm_name, 180);
  const email = clean(body.email, 180);
  const status = clean(body.status || "active", 30).toLowerCase();

  if (!firmName) {
    return json({ ok: false, error: "Firm name is required." }, 400);
  }
  if (email && !isEmail(email)) {
    return json({ ok: false, error: "Please enter a valid email." }, 400);
  }
  if (!LAW_FIRM_STATUSES.has(status)) {
    return json({ ok: false, error: "Invalid firm status." }, 400);
  }

  const result = await env.DB.prepare(`
    INSERT INTO law_firms (
      firm_name, contact_name, email, phone, state, city,
      practice_areas, max_daily_leads, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    firmName,
    clean(body.contact_name, 120),
    email,
    clean(body.phone, 40),
    clean(body.state, 500),
    clean(body.city, 120),
    clean(body.practice_areas, 1500),
    Math.max(0, Math.min(1000, Number(body.max_daily_leads) || 0)),
    status
  ).run();

  return json({ ok: true, id: result.meta?.last_row_id || null }, 201);
}

async function updateLawFirm(request, env, id) {
  if (!isAdmin(request, env)) {
    return json({ ok: false, error: "Unauthorized." }, 401);
  }

  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId < 1) {
    return json({ ok: false, error: "Invalid law firm ID." }, 400);
  }

  const existing = await env.DB.prepare(`
    SELECT * FROM law_firms WHERE id = ? LIMIT 1
  `).bind(numericId).first();

  if (!existing) {
    return json({ ok: false, error: "Law firm not found." }, 404);
  }

  const body = await request.json();
  const firmName = clean(body.firm_name ?? existing.firm_name, 180);
  const email = clean(body.email ?? existing.email, 180);
  const status = clean(body.status ?? existing.status, 30).toLowerCase();

  if (!firmName) {
    return json({ ok: false, error: "Firm name is required." }, 400);
  }
  if (email && !isEmail(email)) {
    return json({ ok: false, error: "Please enter a valid email." }, 400);
  }
  if (!LAW_FIRM_STATUSES.has(status)) {
    return json({ ok: false, error: "Invalid firm status." }, 400);
  }

  await env.DB.prepare(`
    UPDATE law_firms
    SET firm_name = ?, contact_name = ?, email = ?, phone = ?, state = ?, city = ?,
        practice_areas = ?, max_daily_leads = ?, status = ?
    WHERE id = ?
  `).bind(
    firmName,
    clean(body.contact_name ?? existing.contact_name, 120),
    email,
    clean(body.phone ?? existing.phone, 40),
    clean(body.state ?? existing.state, 500),
    clean(body.city ?? existing.city, 120),
    clean(body.practice_areas ?? existing.practice_areas, 1500),
    Math.max(0, Math.min(1000, Number(body.max_daily_leads ?? existing.max_daily_leads) || 0)),
    status,
    numericId
  ).run();

  return json({ ok: true });
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


  const sendLeadMatch = pathname.match(/^\/api\/leads\/([^/]+)\/send-to-firm$/);
  if (sendLeadMatch && request.method === "POST") {
    return sendLeadToFirm(request, env, decodeURIComponent(sendLeadMatch[1]));
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


  if (pathname === "/api/law-firms") {
    if (request.method === "GET") {
      return listLawFirms(request, env);
    }
    if (request.method === "POST") {
      return createLawFirm(request, env);
    }
  }

  const lawFirmMatch = pathname.match(/^\/api\/law-firms\/(\d+)$/);
  if (lawFirmMatch && request.method === "PATCH") {
    return updateLawFirm(request, env, lawFirmMatch[1]);
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

    if (url.pathname === "/dashboard" || url.pathname === "/dashboard/") {
      return Response.redirect(`${url.origin}/dashboard.html`, 302);
    }

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url.pathname);
    }

    return env.ASSETS.fetch(request);
  }
};
