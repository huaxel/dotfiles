# macOS CLI toolchain owned by Nix.
#
# These were Homebrew formulae. All are pure command-line tools with cached
# aarch64-darwin builds, so moving them here costs no compile time.
#
# Division of responsibility after this module:
#   Nix    - CLI tools and dev toolchain (this file + common.nix)
#   Brew   - GUI applications (casks), kexts/daemons, and the runtime tools
#            deliberately left out (see config/Brewfile)
#
# When adding a tool, delete its `brew "..."` line from config/Brewfile in the
# same change. Two managers installing one binary shadow each other silently,
# and which one wins is not obvious: in an interactive zsh `/opt/homebrew/bin`
# comes before `~/.nix-profile/bin`, so an older brew copy of a tool can quietly
# take precedence over the Nix one. Leftovers are not a fallback, they are a
# second version of the same command.
#
# Not to be "fixed": `git`, `age` and `sops` are also in config/Brewfile on
# purpose. bootstrap.sh installs them before Home Manager exists, so the brew
# copies serve a fresh Mac and the Nix copies serve the running system.
#
# Kept on Homebrew on purpose (not listed here):
#   colima qemu    - docker runtime; nix's colima bundles its own lima/qemu and
#                    would have to adopt the existing VM.
#   php php@8.3    - brew services + pecl extension workflow.
#   julia          - nixpkgs julia is a source build (use julia-bin if moving).
#   llama.cpp      - Metal flags plus the local model config in config/llama.cpp.
#   hf weasyprint  - exist only as python3Packages closures.
#   gnu-typist     - absent from nixpkgs.
#   borders        - felixkratz tap daemon; needs launchd + Accessibility grant.
#
# Shims that disappeared with the brew copies, none of them referenced by this
# repo or by any shell history: the g-prefixed coreutils aliases (Nix ships the
# unprefixed names), automake-1.20/aclocal-1.20 (version in the name), cmake's
# ccmake, rsync's rrsync, autossh's rscreen, nmap's ndiff, hledger-ui and
# hledger-web (separate attrs here if ever needed), and imagemagick's
# Magick*-config development helpers. poppler needed a real fix, not a shim:
# its CLI tools live in poppler-utils, see the documents group.
{ pkgs, ... }:

{
  home.packages = with pkgs; [
    # -- Core utilities --------------------------------------------------
    bashInteractive
    coreutils
    csvlens
    flock
    rename
    rsync
    tree
    watch
    wget

    # -- macOS system integration ----------------------------------------
    blueutil
    m-cli
    macmon
    mactop
    mas
    nowplaying-cli
    switchaudio-osx

    # -- Build toolchain -------------------------------------------------
    autoconf-archive
    automake
    bats
    cmake
    gnumake
    meson

    # -- Runtimes and language tooling -----------------------------------
    jdk
    jdk21
    luarocks
    pipx

    # -- Containers and infrastructure -----------------------------------
    autossh
    cloudflared
    docker-client
    docker-compose
    flyctl
    minikube
    mosh

    # -- Documents, media, data ------------------------------------------
    chafa
    exiftool
    graphviz
    imagemagick
    marp-cli
    mpv
    ocrmypdf
    pandoc
    # poppler-utils, not poppler: the pdf/pptx skills shell out to pdftotext,
    # pdftoppm and pdfimages, and only this output ships them. nixpkgs spells
    # the attribute with a dash, so it needs the qualified form here.
    pkgs."poppler-utils"
    tectonic
    typst

    # -- Accounting ------------------------------------------------------
    hledger
    ledger

    # -- Terminal UX and shell -------------------------------------------
    bottom
    broot
    duf
    dust
    fastfetch
    fish
    gum
    hyperfine
    nnn
    procs
    viddy

    # -- Network, transfer, benchmarking ---------------------------------
    fio
    nmap
    rclone
    transmission_4

    # -- Developer workflow ----------------------------------------------
    actionlint
    exercism
    git-crypt
    git-filter-repo
    git-secrets
    gitleaks
    hunk
    opencode
    sqlcmd
    usage
    worktrunk
    xcodegen
    yq

  ];
}
