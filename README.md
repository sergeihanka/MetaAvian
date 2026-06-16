# Aviary

Aviary is a daily bird taxonomy guessing game. Each day players identify a mystery bird species by receiving proximity hints based on where their guesses land in the NCBI taxonomic tree — from cold (only sharing Class Aves) to hot (same genus) to correct.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values before running locally.

| Variable | Description |
|---|---|
| `NODE_ENV` | `development` or `production` |
| `PORT` | TCP port for the Express server (Heroku sets this automatically) |
| `MONGODB_URI` | MongoDB connection string. Local: `mongodb://localhost:27017/aviary`. Atlas: include `/aviary` database name in the URI |
| `JWT_SECRET` | Long random string for signing JWTs — generate with `openssl rand -hex 64` |
| `JWT_EXPIRES_IN` | Token lifetime (e.g. `7d`, `24h`) |
| `SESSION_SECRET` | Long random string for express-session — generate with `openssl rand -hex 64` |
| `GOOGLE_CLIENT_ID` | OAuth2 client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | OAuth2 client secret from Google Cloud Console |
| `GOOGLE_CALLBACK_URL` | Must match the redirect URI registered in Google Cloud Console |
| `APPLE_CLIENT_ID` | Apple Services ID (e.g. `com.metaavian.web`) |
| `APPLE_TEAM_ID` | 10-character team ID from Apple Developer account |
| `APPLE_KEY_ID` | Key ID of the Sign in with Apple private key |
| `APPLE_PRIVATE_KEY` | Contents of the `.p8` key file, **base64-encoded as a single line** (see below) |
| `APPLE_CALLBACK_URL` | Must match the redirect URI registered in Apple Developer Portal |
| `SENDGRID_API_KEY` | SendGrid API key for transactional email (verification, password reset) |
| `EMAIL_FROM` | Verified sender address (e.g. `noreply@metaavian.com`) |
| `CLIENT_URL` | Full URL of the front-end app. Dev: `http://localhost:5173`. Prod: `https://meta-avian.herokuapp.com` |

---

## Local Setup

**Prerequisites:** Node.js >=20.x, npm >=10.x, MongoDB running locally.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and fill in JWT_SECRET, SESSION_SECRET, and MONGODB_URI at minimum

# 3. Seed bird taxonomy data (downloads ~60 MB NCBI taxdump on first run)
npm run seed:birds

# 4. Generate daily puzzles (requires birds to be seeded first)
npm run seed:puzzles

# 5. Start development server (API on :3001, client on :5173)
npm run dev
```

---

## Heroku Deployment

```bash
# Connect to the Heroku app
heroku git:remote -a meta-avian

# Set all required config vars
heroku config:set NODE_ENV=production --app meta-avian
heroku config:set MONGODB_URI="mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/aviary?retryWrites=true&w=majority&appName=dev" --app meta-avian
heroku config:set JWT_SECRET="$(openssl rand -hex 64)" --app meta-avian
heroku config:set JWT_EXPIRES_IN=7d --app meta-avian
heroku config:set SESSION_SECRET="$(openssl rand -hex 64)" --app meta-avian
heroku config:set GOOGLE_CLIENT_ID=your_client_id --app meta-avian
heroku config:set GOOGLE_CLIENT_SECRET=your_client_secret --app meta-avian
heroku config:set GOOGLE_CALLBACK_URL=https://meta-avian.herokuapp.com/api/v1/auth/google/callback --app meta-avian
heroku config:set APPLE_CLIENT_ID=com.metaavian.web --app meta-avian
heroku config:set APPLE_TEAM_ID=XXXXXXXXXX --app meta-avian
heroku config:set APPLE_KEY_ID=XXXXXXXXXX --app meta-avian
heroku config:set APPLE_PRIVATE_KEY="$(cat AuthKey_XXXXXXXXXX.p8 | base64)" --app meta-avian
heroku config:set APPLE_CALLBACK_URL=https://meta-avian.herokuapp.com/api/v1/auth/apple/callback --app meta-avian
heroku config:set SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxx --app meta-avian
heroku config:set EMAIL_FROM=noreply@metaavian.com --app meta-avian
heroku config:set CLIENT_URL=https://meta-avian.herokuapp.com --app meta-avian

# Deploy
git push heroku main
```

### MongoDB Atlas

1. Create a free cluster at [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create a database user with read/write access
3. In **Network Access**, add `0.0.0.0/0` (Heroku has no static IP)
4. Copy the connection string and **append `/aviary`** before the `?` query params:
   ```
   mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/aviary?retryWrites=true&w=majority&appName=dev
   ```

---

## Apple Sign In — Private Key Encoding

Apple provides a `.p8` private key file. Encode it as a single-line base64 string for the environment variable:

```bash
# macOS / Linux
cat AuthKey_XXXXXXXXXX.p8 | base64 | tr -d '\n'
```

Set the output as `APPLE_PRIVATE_KEY`. The server decodes it back to PEM at startup.

---

## DNS for metaavian.com (SendGrid Email Delivery)

Configure these DNS records in Squarespace to enable transactional email via SendGrid:

1. **SPF** — Update your existing SPF TXT record on `metaavian.com`:
   - **Change** `v=spf1 -all` **to** `v=spf1 include:sendgrid.net ~all`

2. **DKIM** — Add two CNAME records provided by SendGrid after completing domain authentication at [app.sendgrid.com](https://app.sendgrid.com) → Settings → Sender Authentication:
   - `s1._domainkey.metaavian.com` → CNAME value from SendGrid
   - `s2._domainkey.metaavian.com` → CNAME value from SendGrid

3. **DMARC** — No changes needed; existing DMARC policy will start passing once SPF and DKIM are verified.

After updating DNS, click **Verify** in the SendGrid domain authentication flow. Propagation can take up to 48 hours.

---

## Seed Script Requirements

- Node.js >=20.x
- MongoDB running (local or Atlas)
- `MONGODB_URI` set in `.env`
- Internet access (seed-birds downloads ~60 MB from NCBI FTP on first run)
- On subsequent runs, if `tmp/taxdump/nodes.dmp` exists, the download is skipped