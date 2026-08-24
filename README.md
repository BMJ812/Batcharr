# Batcharr

Batcharr is a self-hosted bulk media request and confirmation interface for **Radarr** and **Sonarr**.

Instead of searching and adding titles one at a time, you can give Batcharr a mixed list of movies and television series, resolve those titles against your own Arr instances, review the matches, skip duplicates or incorrect results, and submit only the requests you approve.

Batcharr does **not** download media itself. Radarr and Sonarr remain responsible for monitoring, searching, downloading, and library management after a request is submitted.

## Highlights

- Mixed movie and television batches
- Copied external-list importing without requiring an API account
- Plain pasted-title lists
- `TXT`, `CSV`, and `JSON` file imports
- Optional direct TMDb public-list importing
- Optional Discord slash-command requests
- Radarr API v3 support
- Sonarr API v3 and v5 detection
- Poster, title, year, overview, destination, and confidence review
- Alternate-match selection
- Individual approve/skip controls
- Bulk approval of high-confidence matches
- Duplicate detection using stable TMDb/TVDb identifiers
- Configurable Arr request defaults
- Persistent SQLite request history
- Encrypted credential storage
- Optional shared-password WebUI protection
- Unraid-friendly `PUID` / `PGID`
- Published GHCR container image
- Official Unraid Community Applications template

## How Batcharr works

```text
List / file / Discord request
           ↓
Parse titles and optional years
           ↓
Resolve through Radarr / Sonarr
           ↓
Review matches and duplicates
           ↓
Approve only what you want
           ↓
Submit approved requests to Arr
```

Batcharr deliberately keeps a human confirmation step for ambiguous matches. It does not silently assume that the first fuzzy search result is correct.

## Import methods

### External list — recommended for copied website lists

Copy the visible text from a list page and paste it into **Bulk Import → External list**.

Batcharr attempts to extract plausible title rows, associate nearby release years, remove duplicate entries, and ignore common navigation/metadata noise. This workflow does not require a TMDb developer account and does not make Batcharr browse arbitrary URLs.

### Paste titles

Paste a clean list directly into the WebUI:

```text
The Thing (1982)
movie: Alien
TV | The Expanse (2015)
Dark - 2017
```

Batcharr understands movie/film and TV/show/series prefixes plus common year formats. Unlabeled titles can search both configured Arr services or the entire batch can be forced to one media type.

### File upload

Batcharr accepts `TXT`, `CSV`, and `JSON` files.

Current limits:

- Maximum file size: **2 MiB**
- Maximum unique titles per batch: **200**
- Uploaded file content is parsed in memory and is not retained as an uploaded file

#### CSV

CSV files require a header row. Recognized fields include:

```text
title,year,type,tmdb_id,tvdb_id
```

`title` is required. Type values can use movie/film or television/show/series forms. A movie TMDb ID or series TVDb ID enables exact Arr matching instead of fuzzy title lookup.

#### JSON

JSON can be a top-level array or an object with an `items` array:

```json
{
  "items": [
    {
      "title": "Alien",
      "year": 1979,
      "type": "movie",
      "tmdbId": 348
    }
  ]
}
```

### Direct TMDb list import — optional

If you configure your own TMDb API Read Access Token, Batcharr can load a TMDb list by URL or numeric list ID. This preserves exact TMDb movie identifiers where available.

The copied external-list workflow remains the recommended method for most users and requires no TMDb account.

## Review workflow

After resolving a batch, Batcharr shows a review queue with statuses such as:

- Needs review
- Approved
- Skipped
- Already present
- Added
- Failed

For each resolved item you can inspect metadata, review confidence, choose another candidate when necessary, approve the correct match, or skip the item.

Items already present in the target Arr library are marked as duplicates and are not submitted again.

A successful Batcharr request means Radarr or Sonarr accepted the item. It does **not** mean the media has finished downloading.

## Radarr configuration

Batcharr can store and use:

- Radarr URL
- API key
- Root folder
- Quality profile
- Minimum availability
- Monitored state
- Search-on-add behavior

## Sonarr configuration

Batcharr can store and use:

- Sonarr URL
- API key
- Root folder
- Quality profile
- Series type
- Monitor behavior
- Season-folder behavior
- Search-on-add behavior

## Request history

Batcharr keeps request history in SQLite. Entries include the media type, title, optional year/external ID, status, result message, and timestamp.

## Discord integration

Discord support is optional and can be configured from Batcharr's **Settings** page.

Available slash commands:

- `/movie` — find and request a movie
- `/show` — find and request a television series
- `/list` — resolve and review a mixed list

Discord requests use interactive confirmation controls rather than automatically submitting the first result. Batcharr can optionally restrict Discord use by allowed channel IDs and/or role IDs.

The Docker image includes the Batcharr Discord gateway worker. Batcharr also exposes `/api/discord/interactions` for Discord application configurations that use an Interaction Endpoint URL.

## Install on Unraid

Batcharr is available through **Unraid Community Applications**.

1. Open **Apps** in the Unraid WebGUI.
2. Search for **Batcharr**.
3. Install the application.
4. Generate and save a stable `BATCHARR_SECRET`.
5. Optionally configure `BATCHARR_PASSWORD`.
6. Open the WebUI on the configured port (default host port `5058`).
7. Configure Radarr and/or Sonarr from **Settings**.

Generate a strong secret from an Unraid terminal:

```bash
openssl rand -hex 32
```

Keep that value stable. Changing it makes previously saved encrypted credentials unreadable.

Official Unraid template repository:

https://github.com/BMJ812/Batcharr-Unraid-Templates

Support thread:

https://forums.unraid.net/topic/199956-support-batcharr-bulk-radarr-and-sonarr-requests/

## Run with Docker Compose

The default Compose file uses the published image:

```text
ghcr.io/bmj812/batcharr:latest
```

1. Copy `.env.example` to `.env`.
2. Replace the example secret and choose whether to use a WebUI password.
3. Change host port `5058` in `compose.yaml` if needed.
4. Pull and start the container.

PowerShell:

```powershell
$ErrorActionPreference = 'Stop'
Copy-Item .env.example .env
notepad .env
docker compose pull
docker compose up -d
docker compose ps
```

Open:

```text
http://localhost:5058
```

## Networking notes

When Batcharr shares a custom Docker network with Radarr and Sonarr, internal container names can be used:

```text
http://radarr:7878
http://sonarr:8989
```

Otherwise use an address reachable from **inside** the Batcharr container.

## Environment variables

### Core container variables

| Variable | Required | Purpose |
|---|---|---|
| `BATCHARR_SECRET` | Yes | Stable encryption secret for saved credentials |
| `BATCHARR_PASSWORD` | No | Optional shared WebUI password; blank disables login protection |
| `BATCHARR_COOKIE_SECURE` | No | Set `true` only when Batcharr is accessed exclusively through HTTPS |
| `PUID` | No | Runtime user ID; Unraid default is `99` |
| `PGID` | No | Runtime group ID; Unraid default is `100` |
| `TZ` | No | IANA timezone |
| `BATCHARR_CONFIG_DIR` | No | Persistent data directory; Docker image default is `/config` |

### Optional integration overrides

The integrations below can normally be configured in the WebUI. Environment variables are useful when deployment configuration should remain outside the SQLite settings database.

| Variable | Purpose |
|---|---|
| `TMDB_ACCESS_TOKEN` | TMDb API Read Access Token |
| `DISCORD_APPLICATION_ID` | Discord application ID |
| `DISCORD_PUBLIC_KEY` | Discord public key |
| `DISCORD_BOT_TOKEN` | Discord bot token |
| `DISCORD_GUILD_ID` | Discord guild/server ID |
| `DISCORD_ALLOWED_CHANNEL_IDS` | Optional channel allowlist |
| `DISCORD_ALLOWED_ROLE_IDS` | Optional role allowlist |

Environment-provided integration values override their corresponding saved values.

## Security notes

- Arr API keys are encrypted before being written to SQLite.
- TMDb and Discord secrets stored through Batcharr are encrypted server-side.
- Saved secret credentials are not returned to the browser after they are stored.
- `BATCHARR_SECRET` must remain private and stable across container updates/restores.
- Leave `BATCHARR_PASSWORD` blank only when another trusted network/access-control layer protects the application.
- Set `BATCHARR_COOKIE_SECURE=true` only when the browser reaches Batcharr exclusively through HTTPS.
- Do not post API keys, bot tokens, passwords, or `BATCHARR_SECRET` in issues, logs, screenshots, or support messages.

## Current limitations

- One Radarr instance and one Sonarr instance
- One optional shared WebUI password rather than individual accounts
- 200 unique titles per WebUI batch
- Copied external-list importing requires the user to copy visible page text
- Direct TMDb list importing requires a user-supplied developer token
- Batcharr submits to Arr but does not control the downstream download queue
- The current published container workflow targets `linux/amd64`

## Container image

Latest image:

```bash
docker pull ghcr.io/bmj812/batcharr:latest
```

Package page:

https://github.com/BMJ812/Batcharr/pkgs/container/batcharr

The GitHub Actions publication workflow publishes `latest` from the default branch and version-derived tags from `v*` tags.

## Updating

For Docker Compose:

```bash
docker compose pull
docker compose up -d
```

For Unraid, use the normal Docker update flow or **Force Update** if necessary. Preserve `/config` and the existing `BATCHARR_SECRET`.

## Local development

Requirements include Node.js/npm compatible with the repository lockfile and application stack.

PowerShell:

```powershell
$ErrorActionPreference = 'Stop'
npm ci
$env:BATCHARR_CONFIG_DIR = "$PWD\data"
$env:BATCHARR_SECRET = "development-secret-change-me-123456789"
$env:BATCHARR_PASSWORD = "batcharr"
npm run dev
```

Open:

```text
http://localhost:3000
```

Validation commands:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

## Project boundaries

Batcharr is intentionally focused:

- It talks to Radarr and Sonarr rather than controlling download clients directly.
- Stable external IDs are preferred for duplicate detection and exact matching.
- Ambiguous results are presented for human confirmation.
- Requests are submitted through the configured Arr defaults rather than bypassing Arr policy.

## License

Batcharr is licensed under the **zlib License** (`Zlib`). See [LICENSE](LICENSE).

Versions of Batcharr that were previously distributed under the MIT License remain available to their recipients under the MIT terms that applied to those versions. The zlib License applies to versions distributed after the relicensing change.
