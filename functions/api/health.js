import { json } from "../_lib/utils.js";

export async function onRequestGet({ env }) {
  if (!env.DB) {
    return json({ ok:false, database:false, error:"DB binding is missing." }, 500);
  }

  try {
    const tables = await env.DB.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name IN ('leads','law_firms')
      ORDER BY name
    `).all();

    const names = (tables.results || []).map(row => row.name);
    const ready = names.includes("leads") && names.includes("law_firms");

    return json({
      ok:ready,
      database:true,
      schema_ready:ready,
      tables:names
    }, ready ? 200 : 503);
  } catch {
    return json({ ok:false, database:true, schema_ready:false }, 500);
  }
}
