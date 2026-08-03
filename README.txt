CLAIMAXIS COMPLETE ONE-FOLDER BUILD

This build uses Cloudflare Pages advanced mode with one root-level _worker.js.
Do not keep a functions directory in the repository with this build.

Required Cloudflare configuration:
- D1 binding: DB
- Secret: ADMIN_TOKEN

Endpoints:
- GET /api/health
- POST /api/leads
- GET /api/leads 
- GET/PATCH /api/leads/:id
- POST/GET /api/firm-requests
