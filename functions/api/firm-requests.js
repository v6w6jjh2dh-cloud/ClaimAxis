import { json, clean, isEmail, requireAdmin } from "../_lib/utils.js";

function volumeToDaily(value) {
  const text = String(value || "");
  if (text.includes("100")) return 5;
  if (text.includes("50")) return 3;
  if (text.includes("25")) return 2;
  return 1;
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) return json({ ok:false, error:"Database binding DB is missing." }, 500);

    const body = await request.json();
    const firmName = clean(body.firm_name, 180);
    const contactName = clean(body.contact_name, 120);
    const email = clean(body.email, 180);
    const phone = clean(body.phone, 40);

    if (!firmName || !contactName || !email || !phone) {
      return json({ ok:false, error:"Firm, contact, email, and phone are required." }, 400);
    }
    if (!isEmail(email)) {
      return json({ ok:false, error:"Please enter a valid email." }, 400);
    }

    const territory = clean(body.territory, 500);
    const practice = [
      clean(body.practice_area, 150),
      clean(body.lead_type, 80),
      clean(body.budget, 80),
      clean(body.message, 1500)
    ].filter(Boolean).join(" | ");

    await env.DB.prepare(`
      INSERT INTO law_firms (
        firm_name, contact_name, email, phone,
        state, city, practice_areas,
        max_daily_leads, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      firmName,
      contactName,
      email,
      phone,
      territory,
      "",
      practice,
      volumeToDaily(body.volume),
      "pending"
    ).run();

    return json({ ok:true, request_id:`F-${Date.now()}` }, 201);
  } catch (error) {
    console.error(error);
    return json({ ok:false, error:"Unable to save the firm request." }, 500);
  }
}

export async function onRequestGet({ request, env }) {
  if (!requireAdmin(request, env)) {
    return json({ ok:false, error:"Unauthorized." }, 401);
  }

  const { results } = await env.DB.prepare(`
    SELECT id, firm_name, contact_name, email, phone,
           state, city, practice_areas, max_daily_leads,
           status, created_at
    FROM law_firms
    ORDER BY datetime(created_at) DESC
    LIMIT 250
  `).all();

  return json({ ok:true, requests:results || [] });
}
