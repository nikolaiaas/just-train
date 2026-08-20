#!/bin/zsh

set -euo pipefail

project_directory="${0:A:h}"
console_url="http://127.0.0.1:11009"
repository_id="$(printf '%s' "$project_directory" | shasum -a 256 | awk '{print substr($1, 1, 16)}')"

cd "$project_directory"

function is_this_checkout_console_running() {
  local health_response
  health_response="$(curl --silent --fail --max-time 1 "$console_url/api/health" 2>/dev/null || true)"
  [[ "$health_response" == *'"app":"bare-traen-dev-console"'* && "$health_response" == *"\"repositoryId\":\"$repository_id\""* ]]
}

if is_this_checkout_console_running; then
  open "$console_url"
  exit 0
fi

if lsof -nP -iTCP:11009 -sTCP:LISTEN >/dev/null 2>&1; then
  osascript -e 'display alert "Bare Træn kan ikke starte" message "Port 11009 bruges af et andet program eller en anden worktree. Luk det først, eller bed Codex eller Claude om hjælp." as critical'
  exit 1
fi

mise_executable="$(command -v mise 2>/dev/null || true)"

for mise_fallback in "/opt/homebrew/bin/mise" "/usr/local/bin/mise" "${HOME}/.local/bin/mise"; do
  if [[ -z "$mise_executable" && -x "$mise_fallback" ]]; then
    mise_executable="$mise_fallback"
  fi
done

if [[ -z "$mise_executable" ]]; then
  osascript -e 'display alert "Bare Træn kan ikke starte" message "Programmet mise blev ikke fundet. Bed Codex eller Claude om at kontrollere den lokale opsætning." as critical'
  exit 1
fi

(
  for attempt in {1..240}; do
    if is_this_checkout_console_running; then
      open "$console_url"
      exit 0
    fi
    sleep 0.25
  done
) &

exec "$mise_executable" exec -- pnpm dev:console
