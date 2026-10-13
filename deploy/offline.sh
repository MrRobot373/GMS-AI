#!/usr/bin/env bash
# The offline bundle: everything a server without internet needs (docs/10-team-server.md#offline).
#   deploy/offline.sh save /mnt/usb/aatmiq-bundle    on a machine with internet and Docker
#   deploy/offline.sh load /mnt/usb/aatmiq-bundle    on the server, then: deploy/team.sh up -d
#
# save reads deploy/.env like team.sh (LINEUP, the models, AATMIQ_IMAGE_PREFIX/AATMIQ_VERSION),
# gets every image the stack uses (pulled, or built from the source when no registry is set),
# saves them, downloads the models into folders shaped like the Compose volumes, and copies the
# deploy folder (never deploy/.env: it holds the secrets). About 50 GB for the default lineup.
# load checks the files, loads the images, puts the models in the volumes, and turns off what would
# need the internet (model downloads, the license check-in).
#
# For trying it on a small scale: OFFLINE_IMAGES="img1 img2" replaces the image list,
# OFFLINE_MODELS=none skips the models.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cmd="${1:-}"
out="${2:-}"
usage() { sed -n '2,4p' "$0" | sed 's/^# //'; exit 1; }
[ -n "$cmd" ] && [ -n "$out" ] || usage
team() { "$DIR/team.sh" "$@"; }
say() { printf '\n== %s\n' "$*"; }
# The Compose project's name for a volume (deploy/docker-compose.yml: name: aatmiq).
vol() { echo "aatmiq_$1"; }

# Models per volume: "<volume> <kind> <model>…", from the stack's settings.
models() {
  team config --format json | python3 -c '
import json, re, sys
c = json.load(sys.stdin)["services"]
def hf(name):
    s = c.get(name)
    return [s["command"][0]] if s and s.get("command") else []
def ollama(name):
    s = c.get(name)
    if not s: return []
    script = " ".join(s.get("entrypoint") or [])
    found = re.search(r"for m in ([^;]+); do", script)
    if found: return found.group(1).split()
    return sorted(set(re.findall(r"ollama pull (\S+?);?(?:\s|$)", script)))
lines = [("models", "hf", hf("vllm") + hf("vllm-small")), ("embeddings", "ollama", ollama("embeddings")),
         ("ollama-chat", "ollama", ollama("ollama-chat")), ("ollama-large", "ollama", ollama("ollama-large"))]
for volume, kind, names in lines:
    names = [n for n in names if n and not n.startswith("$")]
    if names: print(volume, kind, *names)
'
}

save() {
  mkdir -p "$out/images" "$out/models"
  say "Images"
  local images
  if [ -n "${OFFLINE_IMAGES:-}" ]; then
    images="$OFFLINE_IMAGES"
    for i in $images; do docker image inspect "$i" >/dev/null 2>&1 || docker pull "$i"; done
  else
    images="$(team config --images | sort -u | tr '\n' ' ')"
    team pull --ignore-buildable
    # Aatmiq's own images: from the registry when one is set, else built from this source.
    if grep -qE '^AATMIQ_IMAGE_PREFIX=.+' "$DIR/.env"; then team pull; else team build; fi
  fi
  echo "$images" | tr ' ' '\n' | grep . > "$out/images/list.txt"
  docker save -o "$out/images/aatmiq-images.tar" $images
  ls -la "$out/images"

  if [ "${OFFLINE_MODELS:-}" != none ]; then
    say "Models"
    models | while read -r volume kind names; do
      mkdir -p "$out/models/$volume"
      if [ "$kind" = hf ]; then
        local vllm
        vllm="$(team config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["vllm"]["image"])' 2>/dev/null || echo vllm/vllm-openai:v0.30.0)"
        for repo in $names; do
          echo "Hugging Face: $repo"
          docker run --rm --entrypoint python3 -e HF_TOKEN="${HF_TOKEN:-}" -v "$out/models/$volume:/root/.cache/huggingface" "$vllm" \
            -c "from huggingface_hub import snapshot_download; snapshot_download('$repo')"
        done
      else
        local ollama="${OLLAMA_IMAGE:-ollama/ollama:0.40.2}"
        docker rm -f aatmiq-offline-ollama >/dev/null 2>&1 || true
        docker run -d --name aatmiq-offline-ollama -v "$out/models/$volume:/root/.ollama" "$ollama" >/dev/null
        until docker exec aatmiq-offline-ollama ollama list >/dev/null 2>&1; do sleep 1; done
        for m in $names; do echo "Ollama ($volume): $m"; docker exec aatmiq-offline-ollama ollama pull "$m"; done
        docker rm -f aatmiq-offline-ollama >/dev/null
      fi
    done
  fi

  say "The deploy folder"
  rm -rf "$out/deploy"
  mkdir -p "$out/deploy"
  (cd "$DIR" && tar --exclude=./.env --exclude=./license -cf - .) | tar -xf - -C "$out/deploy"
  cp "$DIR/../VERSION" "$DIR/../CHANGELOG.md" "$out/" 2>/dev/null || true

  say "Checksums"
  (cd "$out" && find images models -type f -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
  {
    echo "Aatmiq offline bundle, made $(date -u +%Y-%m-%dT%H:%MZ)"
    echo "Version: $(cat "$DIR/../VERSION" 2>/dev/null || echo unknown)"
    echo "Lineup: $(sed -n 's/^LINEUP=//p' "$DIR/.env" | tail -n 1)"
    echo
    echo "On the server (no internet needed):"
    echo "  deploy/offline.sh load <this folder>   (from this folder's deploy/, or a copy of it)"
    echo "  deploy/team.sh up -d"
  } > "$out/README.txt"
  du -sh "$out"
  echo "Done. Copy $out to the server and run: deploy/offline.sh load <the folder>"
}

load() {
  [ -f "$out/images/aatmiq-images.tar" ] || { echo "$out has no images/aatmiq-images.tar: is it a bundle?"; exit 1; }
  say "Checking the files"
  (cd "$out" && sha256sum --quiet -c SHA256SUMS) || { echo "Some files are damaged or missing: copy the bundle again."; exit 1; }
  say "Images"
  docker load -i "$out/images/aatmiq-images.tar"

  say "Settings for a server without internet"
  if [ -f "$DIR/.env" ]; then
    set_env() { if grep -qE "^$1=" "$DIR/.env"; then sed -i "s#^$1=.*#$1=$2#" "$DIR/.env"; else echo "$1=$2" >> "$DIR/.env"; fi; echo "  $1=$2"; }
    set_env HF_HUB_OFFLINE 1
    set_env LICENSE_SERVER_URL ""
  else
    echo "  No deploy/.env yet: create it (cp deploy/.env.example deploy/.env), set HF_HUB_OFFLINE=1 and"
    echo "  LICENSE_SERVER_URL= (empty), then run this again."
    exit 1
  fi

  if [ -d "$out/models" ] && [ -n "$(ls -A "$out/models" 2>/dev/null)" ]; then
    say "Models"
    # The stack's volumes, labelled as Compose labels its own, then filled from the bundle.
    local helper
    helper="$(head -n 1 "$out/images/list.txt")"
    for src in "$out"/models/*/; do
      local name
      name="$(basename "$src")"
      docker volume inspect "$(vol "$name")" >/dev/null 2>&1 \
        || docker volume create --label com.docker.compose.project=aatmiq --label "com.docker.compose.volume=$name" "$(vol "$name")" >/dev/null
      echo "  $name → volume $(vol "$name") ($(du -sh "$src" | cut -f1))"
      docker run --rm --entrypoint sh -v "$(vol "$name"):/dst" -v "$src:/src:ro" "$helper" -c 'cp -a /src/. /dst/'
    done
  fi
  echo
  echo "Loaded. Start Aatmiq: deploy/team.sh up -d"
}

case "$cmd" in
  save) save ;;
  load) load ;;
  *) usage ;;
esac
