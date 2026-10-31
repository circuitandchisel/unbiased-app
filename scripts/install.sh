#!/usr/bin/env bash
# Unbiased desktop installer.
#
#   curl -fsSL https://raw.githubusercontent.com/circuitandchisel/unbiased-app-releases/main/install.sh | bash
#
# Downloads the latest release DMG, verifies its SHA-256 against the release's
# SHA256SUMS, installs Unbiased.app to /Applications, and clears the download
# quarantine flag so the first launch doesn't hit Gatekeeper.
#
# THE QUARANTINE STRIP IS THE POINT of this script. The app is ad-hoc signed,
# not Developer ID signed + notarized, so a hand-downloaded DMG makes macOS
# refuse to open it ("Apple could not verify…") until the user goes through
# System Settings > Privacy & Security > Open Anyway (right-click > Open on
# macOS 14 and earlier). Removing com.apple.quarantine here avoids that on most
# Macs, once, in a way the whole team can copy-paste. If macOS still objects,
# the Open Anyway path is printed at the end.
#
# This file lives in unbiased-app/scripts/ (the source of truth) and is
# pushed verbatim to the public releases repo by .github/workflows/release.yml.
set -euo pipefail

REPO="circuitandchisel/unbiased-app-releases"
APP_NAME="Unbiased.app"
INSTALL_DIR="${UNBIASED_INSTALL_DIR:-/Applications}"

die() { printf '\033[31merror:\033[0m %s\n' "$1" >&2; exit 1; }
info() { printf '  %s\n' "$1"; }

# ── Platform gate ───────────────────────────────────────────────────────
# The app ships arm64-only (Electron AND the bundled Pareto engine), so an
# Intel Mac cannot run it at all — fail with a clear reason instead of
# installing something that dies on launch.
[ "$(uname -s)" = "Darwin" ] || die "Unbiased desktop is macOS-only (this is $(uname -s))."
if [ "$(uname -m)" != "arm64" ]; then
  die "Unbiased desktop requires an Apple Silicon Mac (M1 or newer); this Mac is $(uname -m)."
fi
os_major="$(sw_vers -productVersion | cut -d. -f1)"
if [ "$os_major" -lt 12 ]; then
  die "Unbiased desktop requires macOS 12 (Monterey) or newer; this Mac runs $(sw_vers -productVersion)."
fi

for cmd in curl shasum hdiutil ditto; do
  command -v "$cmd" >/dev/null 2>&1 || die "missing required command: $cmd"
done

printf '\nInstalling Unbiased desktop…\n\n'

# ── Resolve the latest release ──────────────────────────────────────────
api="https://api.github.com/repos/$REPO/releases/latest"
release_json="$(curl -fsSL "$api")" || die "could not reach $REPO releases (is the repo public and a release published?)"

tag="$(printf '%s' "$release_json" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)"
[ -n "$tag" ] || die "could not determine the latest version"

# Pull the .dmg and SHA256SUMS download URLs out of the release payload.
dmg_url="$(printf '%s' "$release_json" | tr ',' '\n' | sed -n 's/.*"browser_download_url": *"\([^"]*\.dmg\)".*/\1/p' | head -1)"
sums_url="$(printf '%s' "$release_json" | tr ',' '\n' | sed -n 's/.*"browser_download_url": *"\([^"]*SHA256SUMS\)".*/\1/p' | head -1)"
[ -n "$dmg_url" ] || die "release $tag has no .dmg asset"

info "version:  $tag"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"; [ -n "${mnt:-}" ] && hdiutil detach "$mnt" -quiet 2>/dev/null || true' EXIT

# The .dmg lands in a cache folder, not in $tmp: if the download dies partway
# (hundreds of MB from GitHub), the next run resumes from the bytes already on
# disk instead of starting over. It is removed after a successful install.
cache="${XDG_CACHE_HOME:-$HOME/Library/Caches}/Unbiased"
mkdir -p "$cache"
dmg="$cache/$(basename "$dmg_url")"

# Fetch the checksum list first: it says whether a cached .dmg is already
# complete, and a corrupted or tampered download must never reach /Applications.
expected=""
if [ -n "$sums_url" ]; then
  curl -fsSL --retry 3 -o "$tmp/SHA256SUMS" "$sums_url" || die "could not download SHA256SUMS"
  expected="$(awk -v f="$(basename "$dmg")" '$2 == f || $2 == "*"f {print $1}' "$tmp/SHA256SUMS" | head -1)"
fi
sha_of() { shasum -a 256 "$1" | awk '{print $1}'; }

if [ -n "$expected" ] && [ -s "$dmg" ] && [ "$(sha_of "$dmg")" = "$expected" ]; then
  info "download: $(basename "$dmg_url") already complete in $cache"
else
  info "download: $(basename "$dmg_url")"
  # Say how big it is up front, from the server, so nobody guesses whether a
  # slow link is stuck. Falls back to "large" when the size is not advertised.
  size_mb="$(curl -sIL "$dmg_url" 2>/dev/null | awk 'tolower($1)=="content-length:"{s=$2+0} END{if(s>0) printf "%d", s/1000000}')"
  size_note="${size_mb:+about ${size_mb} MB}"; size_note="${size_note:-large}"
  [ -n "$size_mb" ] && info "size:     about ${size_mb} MB, this can take a few minutes"
  # Show progress so a slow link does not look hung, retry on any error, and
  # resume a partial file (-C -). When the cached file is already whole the
  # server refuses the range and curl exits 33 (or 22); the checksum below
  # settles that case, so only treat it as a failure when nothing is on disk.
  curl -fL --progress-bar --retry 5 --retry-delay 3 --retry-all-errors -C - -o "$dmg" "$dmg_url" \
    || { rc=$?; { [ "$rc" -eq 33 ] || [ "$rc" -eq 22 ]; } && [ -s "$dmg" ] \
         || die "download failed (the file is ${size_note}). Run the same command again and it resumes where it stopped, or download the .dmg from https://github.com/$REPO/releases/latest"; }
fi

# ── Verify ──────────────────────────────────────────────────────────────
if [ -n "$expected" ]; then
  actual="$(sha_of "$dmg")"
  if [ "$actual" != "$expected" ]; then
    rm -f "$dmg"  # never resume from a bad file
    die "checksum mismatch — refusing to install (expected $expected, got $actual). Run the command again for a fresh download"
  fi
  info "checksum: verified"
elif [ -n "$sums_url" ]; then
  info "checksum: no entry for $(basename "$dmg") in SHA256SUMS — skipping"
else
  info "checksum: SHA256SUMS not published for $tag — skipping"
fi

# ── Install ─────────────────────────────────────────────────────────────
info "mounting…"
# NOT -quiet: it suppresses the attach table we parse the mount point out of,
# which would leave the image mounted and this script unable to find the app.
mnt="$(hdiutil attach "$dmg" -nobrowse -mountrandom /tmp | awk -F'\t' '/\/tmp\//{print $NF; exit}')"
[ -n "$mnt" ] && [ -d "$mnt/$APP_NAME" ] || { rm -f "$dmg"; die "could not open the disk image (the download may be incomplete). Run the command again for a fresh download"; }

target="$INSTALL_DIR/$APP_NAME"
staged="$INSTALL_DIR/.$APP_NAME.incoming"

# ditto preserves the code signature and resource forks; cp -R can break the
# bundle's seal, which would make macOS reject the app.
#
# Stage the new copy BESIDE the target and swap only once it has landed.
# Deleting the old app first means any later failure — bad payload, full
# disk, no write access — leaves the user with no app at all.
#
# Braces around every expansion are not decoration: `$INSTALL_DIR…` makes
# bash 3.2 in a UTF-8 locale read the ellipsis bytes as part of the variable
# NAME, so `set -u` kills the script mid-install. ${INSTALL_DIR} is immune.
info "installing to ${INSTALL_DIR}…"
rm -rf "$staged"
ditto "$mnt/$APP_NAME" "$staged" || die "install failed (no write access to ${INSTALL_DIR}?)"
if [ -d "$target" ]; then
  info "replacing existing install at ${target}"
  rm -rf "$target" || { rm -rf "$staged"; die "could not remove ${target} (try: sudo rm -rf '${target}')"; }
fi
mv "$staged" "$target" || { rm -rf "$staged"; die "could not move the new app into place"; }

hdiutil detach "$mnt" -quiet || true
rm -f "$dmg"  # installed; the cached download is no longer needed
mnt=""

# ── Clear quarantine ────────────────────────────────────────────────────
xattr -dr com.apple.quarantine "$target" 2>/dev/null || true
if xattr "$target" 2>/dev/null | grep -q com.apple.quarantine; then
  printf '\n\033[33mnote:\033[0m could not clear the quarantine flag. If macOS says it cannot verify %s: click Done, then System Settings > Privacy & Security > Open Anyway.\n' "$APP_NAME"
fi

printf '\n\033[32m✓\033[0m Unbiased %s installed to %s\n\n' "$tag" "$target"
printf 'Launch it from Applications (or: open -a Unbiased).\n'
printf 'On first run, click "Sign in with your browser". There is no key to paste.\n'
printf 'If macOS says it cannot verify Unbiased: click Done, open System Settings > Privacy & Security, scroll to Security, click Open Anyway, then open it again.\n\n'
