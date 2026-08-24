# Batcharr Roadmap

This roadmap reflects the current state of Batcharr rather than the original MVP plan.

## Shipped foundation

- Mixed movie and television batches
- Flexible pasted-title parsing
- Optional release-year parsing
- Explicit movie/TV type prefixes
- Radarr lookup and submission
- Sonarr API v3/v5 detection, lookup, and submission
- Poster, metadata, confidence, and alternate-match review
- Stable-ID duplicate detection
- Individual approve/skip decisions
- Bulk approval of high-confidence matches
- Configurable Arr request defaults
- Persistent SQLite settings and request history
- Encrypted credential storage
- Optional shared-password WebUI authentication
- Docker runtime with `PUID` / `PGID`
- GHCR image publication
- Official Unraid Community Applications template

## Shipped import expansion

- TXT imports
- CSV imports
- JSON imports
- Exact TMDb movie-ID imports
- Exact TVDb series-ID imports
- 2 MiB import-file limit
- 200-title batch limit
- Copied external-list parser that filters common webpage noise
- Optional direct TMDb list import using a user-supplied token

## Shipped Discord integration

- Discord application settings stored in Batcharr
- Optional environment-variable overrides
- Bot/guild connection testing
- Slash-command registration
- `/movie` request flow
- `/show` request flow
- `/list` mixed-list review flow
- Interactive match selection and confirmation
- Optional channel allowlist
- Optional role allowlist
- Bundled Discord gateway worker
- HTTP interaction endpoint support

## Next: stronger batch operations

- Downloadable error reports
- Save unfinished review batches
- Retry failed items without re-resolving the entire source
- Optional watched `/imports` folder with manual approval
- Configurable lookup concurrency
- Configurable batch-size policy

## Later: users and policy

- Individual user accounts
- Administrator and requester roles
- Request attribution in history
- Per-user quotas
- Optional administrator approval before Arr submission
- Account lockout and password-reset workflow

## Later: multiple Arr targets

- Multiple Radarr instances
- Multiple Sonarr instances
- 1080p/4K routing
- Anime-specific Sonarr routing
- Per-batch target selection
- Tags and target defaults by user or import source

## Distribution / operations follow-up

- Multi-architecture container publication beyond the current `linux/amd64` workflow
- Signed release artifacts
- Versioned database migrations
- Backup/restore UI
- Expanded update diagnostics

## Design constraints

- Batcharr does not control download clients directly.
- Arr API keys and integration credentials remain server-side.
- Ambiguous matches require a human decision.
- Stable external IDs, not titles alone, drive duplicate detection when available.
- Batcharr submits approved requests through Radarr/Sonarr rather than replacing Arr policy or queue management.
