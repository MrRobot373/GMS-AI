#!/usr/bin/env bash
# Upgrade test: what people made with one release is all there, and works, after the next.
#   FROM_IMAGE=ghcr.io/<owner>/aatmiq-api:1.0.0 TO_IMAGE=aatmiq-api:ci tests/e2e/run-upgrade.sh
# Starts FROM_IMAGE on a fresh database and files folder and makes data through the API (an owner,
# a chat with an answer, an uploaded document, a project with a note, a Work AI task), stops it,
# starts TO_IMAGE on the same database and files, and checks it all: the session still works,
# signing in works, the chat's messages, the document's file, the project and its note, the task,
# and a new answer in the old chat. TO_VERSION, when set, is the version the new API must report.
# Needs Postgres with pgvector on localhost (as run-work.sh), Docker, curl and jq.
set -euo pipefail
: "${FROM_IMAGE:?set FROM_IMAGE (the release to upgrade from)}"
: "${TO_IMAGE:?set TO_IMAGE (the build to upgrade to)}"
PG="${PG:-postgres://aatmiq:aatmiq@localhost:5432}"
PORT="${UPGRADE_PORT:-4100}"
APP="http://localhost:$PORT"
DB=aatmiq_upgrade
NAME=aatmiq-upgrade-api
DATA="$(mktemp -d)"
JAR="$(mktemp)"
WORK="$(mktemp -d)"
pass=0
fail=0
cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  rm -rf "$JAR" "$WORK"
  # The API wrote the files as root inside the container.
  docker run --rm -v "$DATA:/data" --entrypoint sh "$TO_IMAGE" -c 'rm -rf /data/*' >/dev/null 2>&1 || true
  rm -rf "$DATA"
}
trap cleanup EXIT

check() {
  if eval "$2"; then
    pass=$((pass + 1)); echo "PASS $1"
  else
    fail=$((fail + 1)); echo "FAIL $1"
  fi
}
api() { # method path [json]
  curl -sS -b "$JAR" -c "$JAR" -H "origin: $APP" -X "$1" ${3:+-H 'content-type: application/json' -d "$3"} "$APP$2"
}
start() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" --network host -v "$DATA:/data" \
    -e DATABASE_URL="$PG/$DB" -e APP_SECRET=upgrade-secret-upgrade-secret-upgrade-1 -e APP_URL="$APP" -e PORT="$PORT" \
    -e ALLOW_MOCK_PROVIDER=true -e LICENSE_SERVER_URL= -e WORK_SANDBOX=off -e USER_FIREWALL=off "$1" >/dev/null
  for _ in $(seq 1 120); do curl -sf "$APP/api/health" >/dev/null && return 0; sleep 1; done
  docker logs "$NAME" | tail -30
  echo "$1 didn't start"
  exit 1
}

psql "$PG/postgres" -qc "drop database if exists $DB with (force)" -c "create database $DB"
psql "$PG/$DB" -qc "create extension if not exists vector"

echo "== $FROM_IMAGE: making data"
start "$FROM_IMAGE"
api POST /api/setup '{"orgName":"Upgrade Co","name":"Una Owner","email":"owner@upgrade.test","password":"correct-horse-battery"}' >/dev/null
WS="$(api GET /api/me | jq -r '.workspaces[0].id')"
CHAT="$(api POST /api/chats "{\"workspaceId\":\"$WS\"}" | jq -r .id)"
api POST "/api/chats/$CHAT/messages" '{"content":"Remember the number 4471 for the audit"}' >/dev/null
printf 'The travel policy: economy class for flights under 6 hours.\n' > "$WORK/policy.txt"
DOC="$(curl -sS -b "$JAR" -c "$JAR" -H "origin: $APP" -F "workspaceId=$WS" -F scope=private -F "file=@$WORK/policy.txt;type=text/plain" "$APP/api/documents" | jq -r .id)"
PROJECT="$(api POST /api/projects "{\"workspaceId\":\"$WS\",\"name\":\"Office move\",\"instructions\":\"Answer as a checklist.\"}" | jq -r .id)"
api POST "/api/projects/$PROJECT/sources/note" '{"title":"Movers","content":"The movers come on 12 March."}' >/dev/null
TASK="$(api POST /api/work/tasks "{\"workspaceId\":\"$WS\",\"prompt\":\"Plan the move\",\"start\":false}" | jq -r .id)"
for v in WS CHAT DOC PROJECT TASK; do [ -n "${!v}" ] && [ "${!v}" != null ] || { echo "couldn't make $v on $FROM_IMAGE"; exit 1; }; done
OLD_VERSION="$(api GET /api/me | jq -r '.version // "unknown"')"
docker stop "$NAME" >/dev/null

echo "== $TO_IMAGE (from $OLD_VERSION)"
start "$TO_IMAGE"
check "the session from before the upgrade still works" '[ "$(api GET /api/me | jq -r .user.email)" = owner@upgrade.test ]'
NEW_VERSION="$(api GET /api/me | jq -r '.version // "unknown"')"
[ -z "${TO_VERSION:-}" ] || check "the new API reports $TO_VERSION" '[ "$NEW_VERSION" = "$TO_VERSION" ]'
rm -f "$JAR"
check "signing in with the password works" \
  '[ "$(api POST /api/auth/sign-in/email "{\"email\":\"owner@upgrade.test\",\"password\":\"correct-horse-battery\"}" | jq -r .user.email)" = owner@upgrade.test ]'
check "the chat has both messages" '[ "$(api GET "/api/chats/$CHAT" | jq ".messages | length")" -ge 2 ] && api GET "/api/chats/$CHAT" | jq -e ".messages[] | select(.content | contains(\"4471\"))" >/dev/null'
check "the document's file is the one uploaded" '[ "$(api GET "/api/documents/$DOC/file")" = "$(cat "$WORK/policy.txt")" ]'
check "the project and its note are there" '[ "$(api GET "/api/projects/$PROJECT" | jq -r .name)" = "Office move" ] && api GET "/api/projects/$PROJECT" | jq -e ".sources[] | select(.name | startswith(\"Movers\"))" >/dev/null'
check "the Work AI task is there" '[ "$(api GET "/api/work/tasks/$TASK" | jq -r .task.title)" = "Plan the move" ]'
check "the old chat answers a new message" 'api POST "/api/chats/$CHAT/messages" "{\"content\":\"And the number?\"}" | grep -q "event: done"'

echo
echo "$OLD_VERSION → $NEW_VERSION: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
