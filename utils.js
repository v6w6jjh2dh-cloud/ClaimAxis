export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

export function clean(value, max = 1000) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, max);
}

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

export function newPublicId(prefix = "L") {
  const raw = crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  return `${prefix}-${raw}`;
}

export async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function getClientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "";
}

export function requireAdmin(request, env) {
  const configured = env.ADMIN_TOKEN;
  if (!configured) return false;

  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const headerToken = request.headers.get("x-admin-token") || "";
  return bearer === configured || headerToken === configured;
}

export function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  return {
    "access-control-allow-origin": origin || "*",
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-admin-token",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
}
