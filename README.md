# Batcharr

Batcharr is a self-hosted bulk request and confirmation interface for Radarr and Sonarr.

Paste a mixed list of movies and television series, review the matches returned by your Arr instances, approve the correct titles, and submit the approved batch. Batcharr does not download media itself.

## Current MVP

- Mixed movie and TV lists
- `movie:` and `tv:` line prefixes
- Optional release-year parsing
- Radarr `/api/v3` support
- Sonarr `/api/v3` and `/api/v5` detection
- Poster, year, overview, and confidence review
- Alternate-match selection
- Bulk approval of high-confidence matches
- Duplicate detection using TMDb and TVDB IDs
- SQLite request history
- Encrypted Arr API keys
- Optional single-password login
- Unraid-friendly `PUID` and `PGID`

## List format

```text
The Thing (1982)
movie: Alien
TV | The Expanse (2015)
Dark - 2017
```

Unlabeled titles can search both Radarr and Sonarr or be forced to one media type for the entire batch.

## Run with Docker Compose

1. Copy `.env.example` to `.env` and replace the password and secret.
2. Update `compose.yaml` if port `5058` is already used.
3. Build and start the container.

PowerShell:

```powershell
$ErrorActionPreference = 'Stop'
Copy-Item .env.example .env
notepad .env
docker compose up --build -d
docker compose ps
```

Open `http://localhost:5058`.

## Unraid settings

Use these container values when creating an Unraid template:

| Setting | Value |
|---|---|
| Repository | Build from this repository until an image is published |
| WebUI port | `5058` mapped to container port `3000` |
| Appdata | `/mnt/user/appdata/batcharr` mapped to `/config` |
| `PUID` | `99` |
| `PGID` | `100` |
| `TZ` | `America/Los_Angeles` |
| `BATCHARR_PASSWORD` | A private login password |
| `BATCHARR_SECRET` | A stable random secret of at least 32 characters |

When Batcharr shares a custom Docker network with Radarr and Sonarr, use URLs such as `http://radarr:7878` and `http://sonarr:8989`. Otherwise, use an address reachable from inside the Batcharr container.

## Local development

```powershell
$ErrorActionPreference = 'Stop'
npm ci
$env:BATCHARR_CONFIG_DIR = "$PWD\data"
$env:BATCHARR_SECRET = "development-secret-change-me-123456789"
$env:BATCHARR_PASSWORD = "batcharr"
npm run dev
```

Open `http://localhost:3000`.

## Security notes

- API keys are encrypted before being written to SQLite.
- Changing `BATCHARR_SECRET` makes saved API keys unreadable. Re-enter them after a secret change.
- Leave `BATCHARR_PASSWORD` blank only on a trusted LAN or Tailscale network.
- Set `BATCHARR_COOKIE_SECURE=true` only when the browser reaches Batcharr through HTTPS.
- The first release uses a single shared password, not individual user accounts.

## Planned next steps

1. Per-user accounts and request attribution
2. CSV file upload and watched import folder
3. Saved batch drafts and retry controls
4. Multiple Radarr/Sonarr instances, including 4K routing
5. Per-user quotas and approval policies
6. Unraid Community Applications template
7. Published multi-architecture Docker image
