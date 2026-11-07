# PRD: Hosting and staff login

Authorized by the user 2026-11-07. Progress lives in `roadmap.md` (items 5.1-5.4)
and `plan/phase-5-hosting-auth/`. This lifts the "no auth, localhost only" limit in
`prd-monthly-dashboard.md` and `prd-docs-chat.md` once the conditions below hold.

## Problem

The dashboard, report exports, support report generator, and docs chat run only
on a developer's machine because the API has no authentication. Support staff
need them on a hosted URL, and nobody outside the team may reach them.

## Decisions (made by the user, not open)

- Host: Google Cloud Run, one container. Express serves the API and the built
  frontend (`frontend/dist`). Database: Cloud SQL for PostgreSQL with pgvector.
- Login: Microsoft Entra ID OpenID Connect for staff, restricted to **one** Entra
  group.
- The GCP project, region, tenant id, client id/secret, and allowed group id are
  supplied by the user at deploy time. No code, doc, or test guesses them.

## Requirements

1. Authorization code flow with PKCE (S256) against the tenant's v2.0 endpoints.
   `state` and `nonce` are random per login and checked on the callback.
2. The id token is verified with the tenant's v2.0 JWKS: signature, `iss`
   (`https://login.microsoftonline.com/<tenant>/v2.0`), `aud` (client id), `exp`,
   and `nonce`.
3. The token's `groups` claim must contain `ENTRA_ALLOWED_GROUP_ID`; otherwise
   403. A token without a `groups` claim (including group overage) is refused
   the same way: fail closed, never call Graph to guess.
4. Session: a signed (HMAC-SHA256) cookie, `HttpOnly; Secure; SameSite=Lax;
   Path=/`, with an expiry inside the signed payload (8 hours) and a matching
   `Max-Age`. It carries the display name only. No server-side session store.
5. Logout clears the cookie and sends the browser to the Entra logout endpoint.
6. Every `/api` route requires a valid session, except `/api/health` and the
   auth routes (`/api/auth/login`, `/api/auth/callback`). Missing, tampered, or
   expired cookie → 401. `/health` (outside `/api`) stays open for probes.
   Static frontend files are not secret (public repo) and need no session.
7. Fail closed at startup: if any auth variable is missing and `BACKEND_HOST`
   is not a loopback address, the server refuses to start (non-zero exit). A
   partially set auth configuration is always an error.
8. Localhost development with no auth variables runs exactly as today.
9. External requests are bounded: the token endpoint call has an explicit
   timeout; JWKS fetches use `jose`'s timeout and cache.
10. Logs carry status only: never tokens, cookies, codes, names, or emails.
11. The frontend sends the browser to `/api/auth/login` on any 401, and shows the
    signed-in name and a sign-out control in the header (mn + en).

## Environment

| Var | Required | Purpose |
| --- | --- | --- |
| `ENTRA_TENANT_ID` | when exposed | tenant (directory) id |
| `ENTRA_CLIENT_ID` | when exposed | app registration (client) id |
| `ENTRA_CLIENT_SECRET` | when exposed | client secret (Secret Manager in Cloud Run) |
| `ENTRA_ALLOWED_GROUP_ID` | when exposed | object id of the one group that may log in |
| `SESSION_SECRET` | when exposed | HMAC key, at least 32 characters (Secret Manager) |
| `PUBLIC_URL` | when exposed | https origin of the app; redirect URI is `<PUBLIC_URL>/api/auth/callback` |
| `BACKEND_HOST` | no | bind address; default `127.0.0.1`, container sets `0.0.0.0` |
| `PORT` / `BACKEND_PORT` | no | listen port; Cloud Run sets `PORT`, default 3001 |
| `DATABASE_URL` | yes | Cloud SQL connection string |

The Entra app registration needs a Web redirect URI of
`<PUBLIC_URL>/api/auth/callback` and the `groups` claim in the id token
(Token configuration → groups claim; "Groups assigned to the application" keeps
the claim small enough to avoid overage).

## Out of scope

- Client (customer) login, and any role or permission beyond "member of the one
  group".
- Deploy automation (CI deploy, Terraform) until the user picks the GCP project.
  The README carries a manual runbook with placeholders; nothing is deployed by
  an agent.
- Refresh tokens and silent renewal: an expired session logs in again.
