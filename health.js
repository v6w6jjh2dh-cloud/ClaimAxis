import { json } from "../_lib/utils.js";

export async function onRequestGet({ env }) {
  if (!env.DB) {
    return json({
      ok: false,
      database: false,
      error: "D1 binding DB is missing."
    }, 500);
  }

  try {
    const tables = await env.DB.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name IN ('leads','firm_requests','lead_events')
      ORDER BY name
    `).all();

    const names = (tables.results || []).map(row => row.name);
    const required = ['firm_requests','lead_events','leads'];
    const ready = required.every(name => names.includes(name));

    return json({
      ok: ready,
      database: true,
      schema_ready: ready,
      tables: names
    }, ready ? 200 : 503);
  } catch (error) {
    return json({
      ok: false,
      database: true,
      schema_ready: false,
      error: "Database query failed."
    }, 500);
  }
}
