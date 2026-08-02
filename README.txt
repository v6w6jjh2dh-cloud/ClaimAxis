CLAIMAXIS D1 — PHASE 2
======================

This package upgrades ClaimAxis from static demo forms to a working Cloudflare Pages + D1 application.

Core routes:
- POST /api/leads
- GET /api/leads (admin token required)
- GET /api/leads/:id (admin token required)
- PATCH /api/leads/:id (admin token required)
- POST /api/firm-requests
- GET /api/firm-requests (admin token required)

Required Cloudflare bindings:
- D1 binding name: DB
- Secret: ADMIN_TOKEN

Read SETUP-D1-AR.txt for mobile-friendly setup instructions.

Security note:
The token-based dashboard is suitable for an initial controlled test. Before broader production use, protect the dashboard with Cloudflare Access and add Turnstile/rate limiting.
