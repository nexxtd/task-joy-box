# DNS Records — Task Joy Box

Central record of the domains, DNS entries, and integration URLs used by the app.

## 1. Domains in use

| Purpose | Value | Where configured |
|---|---|---|
| Production frontend (user-facing) | `https://app.myplanner.com` | `FRONTEND_URL` env (server) |
| Render backend origin | `https://task-joy-box.onrender.com` | `RENDER_EXTERNAL_URL` env (Render) |
| Development (Vite) | `http://localhost:5173` | built-in |
| Dev API (Express) | `http://localhost:3001` | built-in |
| Dev tunnels (optional) | ngrok / Cloudflare tunnel URL | `NGROK_URL`, `CF_TUNNEL_URL` env |

> The server derives its allowed CORS origins from `FRONTEND_URL`, `RENDER_EXTERNAL_URL`,
> `NGROK_URL`, `CF_TUNNEL_URL`, and `ADDITIONAL_ALLOWED_ORIGINS` (server/index.ts).
> Add the app domain to the DNS table below **and** to the env vars.

## 2. DNS records

### Root / apex domain (myplanner.com)

| Type | Name | Value | TTL | Notes |
|---|---|---|---|---|
| A | `@` | `<Render static IP or hosting IP>` | 300 | Only if the frontend is served at the apex |
| AAAA | `@` | `<IPv6>` | 300 | Optional |
| TXT | `@` | `v=spf1 ...` | 300 | Only if you send email from this domain |
| MX | `@` | `mx.myplanner.com` | 300 | Only if you use email on this domain |

### App subdomain (frontend)

| Type | Name | Value | TTL | Notes |
|---|---|---|---|---|
| CNAME | `app` | `task-joy-box.onrender.com` | 300 | Points the app to the Render service |
| TXT | `_acme-challenge.app` | (Let's Encrypt value) | 300 | Only during SSL issuance |
| TXT | `app` | `google-site-verification=...` | 300 | Only for Google OAuth verification |

### API subdomain (optional — if you split API from frontend)

| Type | Name | Value | TTL | Notes |
|---|---|---|---|---|
| CNAME | `api` | `task-joy-box.onrender.com` | 300 | Requires `CROSS_SITE_COOKIES=true` on the server |

## 3. Google OAuth (login + Google Calendar sync)

In Google Cloud Console → **APIs & Services → Credentials → OAuth 2.0 Client ID**:

| Field | Value |
|---|---|
| Authorized JavaScript origins | `https://app.myplanner.com` `https://task-joy-box.onrender.com` `http://localhost:5173` |
| Authorized redirect URIs | `https://app.myplanner.com/api/calendar/oauth-callback` `https://task-joy-box.onrender.com/api/calendar/oauth-callback` `http://localhost:3001/api/calendar/oauth-callback` |

Enabled APIs: Google Identity Services (login) + Google Calendar API (calendar sync).

## 4. PayPal

| Field | Value |
|---|---|
| App return URL (subscription) | `https://app.myplanner.com/api/payment/execute-payment` (PayPal appends `?token=...`) |
| App cancel URL | `https://app.myplanner.com/pricing?subscription=cancelled` |
| Workspace return URL | `https://app.myplanner.com/api/workspace/execute-payment` |
| Workspace cancel URL | `https://app.myplanner.com/collaboration?workspace_payment=cancelled` |

Mode controlled by `PAYPAL_MODE=sandbox|live`; sandbox hits `api-m.sandbox.paypal.com`, live hits `api-m.paypal.com`.

## 5. Server env vars to update after a domain change

```env
FRONTEND_URL=https://app.myplanner.com
RENDER_EXTERNAL_URL=https://task-joy-box.onrender.com
ADDITIONAL_ALLOWED_ORIGINS=            # comma-separated, optional
CROSS_SITE_COOKIES=false               # true only if API is on a different origin than the frontend
```

## 6. Checklist after adding/changing a domain

- [ ] DNS record created + propagated (`dig +short app.myplanner.com` or `nslookup`)
- [ ] SSL certificate issued by the hosting provider (let Render/Cloudflare handle it)
- [ ] `FRONTEND_URL` (and `ADDITIONAL_ALLOWED_ORIGINS` if needed) updated on Render
- [ ] Google OAuth origins + redirect URIs updated
- [ ] PayPal app return/cancel URLs updated
- [ ] Redeploy the server so the new origins take effect
- [ ] Verify login, Google login, and a PayPal sandbox checkout end-to-end
