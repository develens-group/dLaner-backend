# BYOK live smoke checklist

Manual end-to-end verification when you have a **real** provider API key. Phase 1 unit tests and mock flows do **not** require this checklist.

## When to run

| Condition | Action |
|-----------|--------|
| `SMOKE_BYOK_API_KEY` **unset** | Skip this document. Rely on `npm test` (e.g. `ai.service.byok.spec.ts`, credential crypto/resolver specs). |
| `SMOKE_BYOK_API_KEY` **set** | Run the checklist below once per environment you care about (local, then optional Vercel). |

## Environment variables (shell only)

Set these in your terminal session. **Never** commit them, paste them into tickets, or put them in this repo.

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `SMOKE_BYOK_API_KEY` | Yes (to run smoke) | — | Real provider secret used only for create-credential + live CHAT |
| `SMOKE_BYOK_PROVIDER` | No | `openai` | Must match a BYOK provider: `openai`, `anthropic`, or `google` |

Also set smoke-specific auth (not stored in git):

| Variable | Purpose |
|----------|---------|
| `SMOKE_EMAIL` | Verified user email for login |
| `SMOKE_PASSWORD` | That user's password |

Backend must already have `AI_CREDENTIALS_ENCRYPTION_KEY` (64-character hex) configured; credential create/decrypt will fail without it.

## Base URL

| Target | `BASE_URL` |
|--------|------------|
| **Local dev** (typical `.env` `PORT=3001`) | `http://localhost:3001` |
| **Vercel** | `https://YOUR_PROJECT.vercel.app` (replace with your deployment URL; see [DEPLOY_VERCEL_FREE_FA.md](./DEPLOY_VERCEL_FREE_FA.md)) |

Use the same `BASE_URL` for every step. On Vercel, confirm `GET $BASE_URL/health/ready` before smoke.

Example (PowerShell):

```powershell
$BASE_URL = "http://localhost:3001"
# $BASE_URL = "https://YOUR_PROJECT.vercel.app"

$env:SMOKE_BYOK_PROVIDER = if ($env:SMOKE_BYOK_PROVIDER) { $env:SMOKE_BYOK_PROVIDER } else { "openai" }
if (-not $env:SMOKE_BYOK_API_KEY) { throw "Set SMOKE_BYOK_API_KEY in this session only." }
```

## Checklist

- [ ] **0. Preconditions** — API up, DB migrated, user verified (`SMOKE_EMAIL` / `SMOKE_PASSWORD`), encryption key set on server.
- [ ] **1. Login** — obtain `accessToken` (body mode) or cookie session.
- [ ] **2. Create credential** — `POST /api/v1/ai/credentials` with provider + key from env; save returned `id` as `CREDENTIAL_ID`.
- [ ] **3. Test connection** — `POST /api/v1/ai/credentials/:id/test`; expect success envelope (decrypt/resolve; no secret in response).
- [ ] **4. CHAT with BYOK** — `POST /api/v1/ai/requests` with `operation: CHAT`, matching `provider`, and `credentialId`.
- [ ] **5. Assert billing** — response `data.status` is `COMPLETED`, `data.billingMode` is `USER_KEY`, and `data.chargedCreditAmount` is `null` or `0`.

---

### 1. Login

`POST /api/v1/auth/login`

```powershell
$login = Invoke-RestMethod -Method Post -Uri "$BASE_URL/api/v1/auth/login" `
  -ContentType "application/json" `
  -Body (@{ email = $env:SMOKE_EMAIL; password = $env:SMOKE_PASSWORD } | ConvertTo-Json)

$TOKEN = $login.data.accessToken
if (-not $TOKEN) { throw "No accessToken in login response (check AUTH_REFRESH_TOKEN_TRANSPORT / cookie mode)." }
$headers = @{ Authorization = "Bearer $TOKEN" }
```

Equivalent `curl`:

```bash
curl -sS -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$SMOKE_EMAIL\",\"password\":\"$SMOKE_PASSWORD\"}"
```

Copy `data.accessToken` into `Authorization: Bearer …` for the steps below.

---

### 2. Create credential

`POST /api/v1/ai/credentials`

Body uses **`SMOKE_BYOK_API_KEY`** only here (never hard-code in files).

```powershell
$createBody = @{
  provider = $env:SMOKE_BYOK_PROVIDER
  apiKey   = $env:SMOKE_BYOK_API_KEY
  label    = "BYOK live smoke"
} | ConvertTo-Json

$cred = Invoke-RestMethod -Method Post -Uri "$BASE_URL/api/v1/ai/credentials" `
  -Headers $headers -ContentType "application/json" -Body $createBody

$CREDENTIAL_ID = $cred.data.id
if (-not $CREDENTIAL_ID) { throw "Expected credential id in response." }
```

Expected: `data` includes `id`, `provider`, `keyHint` — **no** `apiKey` or ciphertext.

---

### 3. Test connection

`POST /api/v1/ai/credentials/{CREDENTIAL_ID}/test`

```powershell
$test = Invoke-RestMethod -Method Post `
  -Uri "$BASE_URL/api/v1/ai/credentials/$CREDENTIAL_ID/test" `
  -Headers $headers

# Example success shape:
# data.ok === true, data.mode === "resolve", data.provider, data.keyHint
if ($test.data.ok -ne $true) { throw "Credential test failed." }
```

Do not log full HTTP bodies in shared logs; responses must not contain the raw key.

---

### 4. POST `/api/v1/ai/requests` (CHAT + `credentialId`)

`POST /api/v1/ai/requests`

Pick a model valid for your provider (OpenAI example: `gpt-4o-mini`). **`provider` must match** the credential's provider.

```powershell
$provider = $env:SMOKE_BYOK_PROVIDER.ToLower()
$model = switch ($provider) {
  "openai"    { "gpt-4o-mini" }
  "anthropic" { "claude-3-5-haiku-latest" }
  "google"    { "gemini-3.8-flash" }
  default     { throw "Unsupported SMOKE_BYOK_PROVIDER: $provider" }
}

$requestBody = @{
  provider     = $provider
  model        = $model
  operation    = "CHAT"
  credentialId = $CREDENTIAL_ID
  input        = @{ prompt = "Reply with exactly: BYOK_SMOKE_OK" }
} | ConvertTo-Json -Depth 5

$ai = Invoke-RestMethod -Method Post -Uri "$BASE_URL/api/v1/ai/requests" `
  -Headers $headers -ContentType "application/json" -Body $requestBody
```

Optional: poll `GET /api/v1/ai/requests/{id}` if your deployment returns before completion (normally this endpoint completes inline).

---

### 5. Assertions (PASS criteria)

On the create response (or GET by id), verify:

| Field | Expected |
|-------|----------|
| `data.status` | `COMPLETED` |
| `data.billingMode` | `USER_KEY` |
| `data.chargedCreditAmount` | `null` **or** numeric `0` |
| `data.credentialId` | Same UUID as `$CREDENTIAL_ID` |

PowerShell sketch:

```powershell
$d = $ai.data
if ($d.status -ne "COMPLETED") { throw "status=$($d.status)" }
if ($d.billingMode -ne "USER_KEY") { throw "billingMode=$($d.billingMode)" }
$charged = $d.chargedCreditAmount
if ($null -ne $charged -and [decimal]$charged -ne 0) {
  throw "chargedCreditAmount=$charged (expected null or 0)"
}
Write-Host "BYOK live smoke PASSED"
```

---

## Cleanup (recommended)

- [ ] `DELETE /api/v1/ai/credentials/{CREDENTIAL_ID}` when finished (optional but avoids leaving live keys in DB on shared dev DBs).
- [ ] Unset `SMOKE_BYOK_API_KEY` from the shell session.

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| 401 on AI routes | Expired access token; login again |
| 400 provider mismatch | `CreateAiRequestDto.provider` ≠ credential provider |
| 404 credential | Wrong `CREDENTIAL_ID` or another user's credential |
| 502 / provider errors | Invalid or revoked provider key; quota/billing on provider account |
| Create credential 500 | Missing/invalid `AI_CREDENTIALS_ENCRYPTION_KEY` on server |

## Related automated coverage

Without `SMOKE_BYOK_API_KEY`, backend BYOK behavior is covered by unit tests (USER_KEY skips credit reserve/capture, provider receives user `apiKey`). This checklist is the optional live confirmation against a real provider.
