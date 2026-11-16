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
- Login: Microsoft Entra ID OpenID Connect for staff, restricted to the Tech
  Success team list kept in the app (changed 2026-11-09, replacing the Entra group).
- The GCP project, region, tenant id, client id/secret, and superadmin email are
  supplied by the user at deploy time. No code, doc, or test guesses them.

## Requirements

1. Authorization code flow with PKCE (S256) against the tenant's v2.0 endpoints.
   `state` and `nonce` are random per login and checked on the callback.
2. The id token is verified with the tenant's v2.0 JWKS: RS256 signature only, `iss`
   (`https://login.microsoftonline.com/<tenant>/v2.0`), `aud` (client id), `exp`,
   and `nonce`.
3. The id token's `preferred_username` (lowercased) must be `SUPERADMIN_EMAIL`
   or an email in the `StaffMember` table; otherwise 403 and no session. A token
   without a usable email is refused the same way. Membership is checked again
   on every `/api` request, so a removed member is out at once (403, cookie cleared).
   The issuer check pins our tenant, so the name is one of our own accounts.
3a. Team page: every member sees the list; only the superadmin adds or removes
   (`GET/POST /api/members`, `DELETE /api/members/:email`). The superadmin is not
   a table row and cannot be removed. Member emails live only in the database,
   never in the repo (it is public).
4. Session: a signed (HMAC-SHA256) cookie, `HttpOnly; Secure; SameSite=Lax;
   Path=/`, with an expiry and a type (`session`; the short-lived login cookie is
   `login`) inside the signed payload (8 hours) and a matching `Max-Age`. It
   carries the display name and email only. No server-side session store.
5. Logout is a same-origin `POST /api/auth/logout` (the `Origin` header must equal
   `PUBLIC_URL`, else 403): it clears the cookie and sends the browser to the
   Entra logout endpoint, which returns to `<PUBLIC_URL>/`.
6. Every `/api` route requires a valid session, except `/api/health` and the
   auth routes (`/api/auth/login`, `/api/auth/callback`). Missing, tampered, or
   expired cookie → 401. `/health` (outside `/api`, checks the database) stays
   open for probes; `/api/health` is open and never touches the database, so
   anonymous traffic cannot drain the connection pool.
   Static frontend files are not secret (public repo) and need no session.
7. Fail closed at startup: if any auth variable is missing and `BACKEND_HOST`
   is not a loopback address, the server refuses to start (non-zero exit). A
   partially set auth configuration is always an error.
8. Localhost development with no auth variables runs exactly as today.
9. External requests are bounded: the token endpoint call has an explicit
   timeout; JWKS fetches use `jose`'s timeout and cache.
10. Logs carry status only: never tokens, cookies, codes, names, or emails.
11. The frontend sends the browser to `/api/auth/login` on a 401 to a GET, at most
    once a minute (a sessionStorage timestamp, cleared once signed in; no storage
    means no auto-redirect) so a dropped cookie cannot loop against Entra. A 401
    to a POST (chat question, upload) shows "session expired, sign in" instead of
    redirecting, so the input is not lost. The header shows the signed-in name
    and a sign-out form (mn + en).
12. A failed callback (expired login, non-member, token error) answers with a
    minimal HTML page carrying the reason and a "sign in again" link, and clears
    the login cookie.
13. `ENTRA_TENANT_ID` must be the tenant GUID (the id token's `iss` always uses
    it); a domain, `common`, or `organizations` fails at startup.

## Environment

| Var | Required | Purpose |
| --- | --- | --- |
| `ENTRA_TENANT_ID` | when exposed | tenant (directory) id, a GUID |
| `ENTRA_CLIENT_ID` | when exposed | app registration (client) id |
| `ENTRA_CLIENT_SECRET` | when exposed | client secret (Secret Manager in Cloud Run) |
| `SUPERADMIN_EMAIL` | when exposed | the one account that manages the team list; always allowed in |
| `SESSION_SECRET` | when exposed | HMAC key, at least 32 characters (Secret Manager) |
| `PUBLIC_URL` | when exposed | https origin of the app; redirect URI is `<PUBLIC_URL>/api/auth/callback` |
| `BACKEND_HOST` | no | bind address; default `127.0.0.1`, container sets `0.0.0.0` |
| `BACKEND_PORT` / `PORT` | no | listen port: `BACKEND_PORT ?? PORT ?? 3001`; the image sets only `PORT` |
| `DATABASE_URL` | yes | Cloud SQL connection string |

The Entra app registration needs two Web redirect URIs,
`<PUBLIC_URL>/api/auth/callback` (sign-in) and `<PUBLIC_URL>/` (after sign-out).
No groups claim is needed.

## Out of scope

- Client (customer) login, and any role beyond "team member" and "superadmin".
- Deploy automation (CI deploy, Terraform) until the user picks the GCP project.
  The README carries a manual runbook with placeholders; nothing is deployed by
  an agent.
- Refresh tokens and silent renewal: an expired session logs in again.
