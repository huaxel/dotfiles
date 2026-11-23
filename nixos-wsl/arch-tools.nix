{ pkgs, ... }:

{
  # Tools recovered from the retired Arch WSL install.
  # Source list: ~/arch-recovery/arch-system/ (740 packages; 81 user-facing
  # tools selected here). The old pacman db had zeroed `desc` files, so which
  # of those 740 were explicitly installed is unknown — this is a curated
  # subset, not a faithful reproduction.
  #
  # Deliberately excluded: service daemons (docker, tailscale, samba service,
  # strongswan), GUI/compositor packages (remmina, ghostty, pipewire, labwc,
  # vulkan-tools) because this host is a terminal-only WSL instance, and Arch
  # packaging libraries that NixOS supplies implicitly.
  environment.systemPackages = with pkgs; [
    bc
    bind
    bottom
    bubblewrap
    cifs-utils
    clang
    cmake
    csvkit
    csvlens
    curl
    delta
    dust
    e2fsprogs
    earlyoom
    fastfetch
    ffmpeg
    file
    fish
    gdb
    git-bug
    git-crypt
    git-filter-repo
    git-secrets
    glow
    gnupg
    go
    gptfdisk
    htop
    httpie
    lld
    llvm
    lm_sensors
    lowdown
    lazygit
    lsd
    lsof
    lua
    luajit
    m4
    nano
    nftables
    nmap
    opencode
    patch
    pciutils
    pcre2
    perl
    pinentry-curses
    poppler
    procs
    python3
    qpdf
    rsync
    ruff
    rustc
    cargo
    samba
    sd
    semver
    sqlite
    strace
    tcpdump
    tesseract
    texinfo
    tldr
    tmux
    tokei
    traceroute
    tree
    tree-sitter
    unzip
    usage
    viddy
    vim
    visidata
    wget
    which
    whois
    yazi
    yq
    zip
    zsh
    zxing-cpp
  ];
}
