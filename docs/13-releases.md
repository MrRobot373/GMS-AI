# Releases

Aatmiq is released as versions (`1.0.0`, `1.1.0`, `1.1.1`…, [semantic versioning](https://semver.org)):
the Docker images in the GitHub container registry, the deploy folder, the desktop packages and the
notes in [CHANGELOG.md](../CHANGELOG.md). Admins see the running version at the bottom of
Admin → Overview.

| Change in the version | Means | Update |
|---|---|---|
| Patch (1.0.0 → 1.0.1) | Fixes only | Any time |
| Minor (1.0 → 1.1) | New features; nothing to do by hand | Any time; read the notes |
| Major (1.x → 2.0) | Something needs a step (listed in the notes) | Plan it, with a backup |

The database is updated automatically when the API starts (migrations); data made with one version
is kept by every later one, and the release workflow proves it for each release (below).

## Installing a release

From the release's page on GitHub, download `aatmiq-deploy-<version>.tar.gz` (or, with the source,
use the `deploy/` folder of the tag), then:

```bash
tar -xzf aatmiq-deploy-1.0.0.tar.gz && cd aatmiq-1.0.0
cp deploy/.env.example deploy/.env      # then edit it (10-team-server.md); it names this release's images
deploy/team.sh pull                     # the release's images
deploy/team.sh up -d                    # no --build: the images come ready
```

The two settings that pick the images, already set in the release's `.env.example`:

| Setting | Example | Without it |
|---|---|---|
| `AATMIQ_IMAGE_PREFIX` | `ghcr.io/<owner>/` | images built here from the source (`up -d --build`) |
| `AATMIQ_VERSION` | `1.0.0` | `latest` |

The images are private to the GitHub organization unless it makes them public; a customer's server
signs in once with a read-only token: `docker login ghcr.io -u <user> --password-stdin`. The
offline bundle (no internet on the server) is in [the team server guide](10-team-server.md).

## Updating

1. Read the notes of each version since yours (CHANGELOG.md).
2. Make a backup: `deploy/team.sh exec backup /scripts/backup.sh`.
3. Set the new version in `deploy/.env`: `AATMIQ_VERSION=1.1.0` (and use the new release's deploy
   folder if the notes say the Compose files changed; keep your `.env`).
4. `deploy/team.sh pull && deploy/team.sh up -d`. The API updates the database as it starts; Admin
   → Health should be green again within a few minutes.

**Going back**: an older version can't read a database a newer one has updated. Restore the backup
from step 2 with the older version ([10-team-server.md#backups](10-team-server.md#backups)).

## Cutting a release (for us)

1. Write what changed under a `## <version> — not yet released` heading in CHANGELOG.md (move it
   out of *Unreleased*), commit.
2. `node scripts/release.mjs 1.1.0` (`--dry-run` shows what it will do). It checks the version is
   newer and has its section, dates the section, writes `VERSION` and the desktop app's version,
   commits `Release 1.1.0` and tags `v1.1.0`. It doesn't push.
3. `git push origin HEAD v1.1.0`. That starts:
   - `.github/workflows/release.yml`: builds the API and web images for the version, runs the
     **upgrade test** (the previous release's API image makes data, an owner, a chat with an
     answer, a document, a project with a note, a Work AI task, and the new one must keep it all
     and work: `tests/e2e/run-upgrade.sh`), then pushes the images as `1.1.0`, `1.1` and `latest`
     and creates the GitHub release with the notes and the deploy folder.
   - `.github/workflows/desktop.yml`: the desktop packages, attached to the same release.
   - CI, as for every push.
4. Pre-releases (`1.1.0-rc.1`) go the same way, marked as pre-releases and without `latest`.

To try the release workflow without publishing: Actions → Release → Run workflow (leave *publish*
off). The upgrade test also runs by hand against any two images:

```bash
FROM_IMAGE=ghcr.io/<owner>/aatmiq-api:1.0.0 TO_IMAGE=aatmiq-api:latest tests/e2e/run-upgrade.sh
```

## Supported versions

To decide with the support terms (rollout checklist item 9): we suggest the latest minor version
and the one before it get fixes; older ones are asked to update.
