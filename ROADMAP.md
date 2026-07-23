# Batcharr Roadmap

## 0.1 — Bulk request MVP

Implemented in the initial scaffold:

- Paste mixed movie and television lists
- Upload TXT, CSV, and JSON lists through the web interface
- Parse optional years and explicit `movie:` / `tv:` prefixes
- Resolve through Radarr and Sonarr
- Detect Sonarr API v3 or v5
- Review posters, metadata, confidence, and alternate matches
- Detect existing titles by TMDb or TVDB ID
- Approve high-confidence matches in bulk
- Submit approved items using saved Arr defaults
- Store encrypted credentials and request history in SQLite
- Optional shared-password authentication
- Docker and Unraid-oriented runtime configuration

## 0.2 — Better batch handling

- TMDb public-list import
- Downloadable error report
- Save unfinished review batches
- Retry failed requests without resolving the entire list again
- Watched `/imports` folder with a manual approval queue
- Configurable lookup concurrency and maximum batch size

## 0.3 — Users and policy

- Individual user accounts
- Administrator and requester roles
- Request attribution in history
- Per-user quotas
- Optional administrator approval before Arr submission
- Account lockout and password-reset workflow

## 0.4 — Multiple Arr targets

- Multiple Radarr and Sonarr instances
- 1080p versus 4K routing
- Anime-specific Sonarr routing
- Per-batch target selection
- Tags and target defaults by user or import source

## 0.5 — Distribution

- GitHub Actions test and image-build workflow
- Multi-architecture GHCR image
- Signed release artifacts
- Unraid Community Applications template
- Versioned database migrations and backup/restore UI

## Design constraints

- Batcharr never controls download clients directly.
- Arr API keys remain server-side.
- Ambiguous matches require a human decision.
- Stable external IDs, not titles, drive duplicate detection.
- Bulk operations are throttled rather than submitted simultaneously.
