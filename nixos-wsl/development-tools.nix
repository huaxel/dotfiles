{ pkgs, ... }:

{
  # Compatibility for standalone binaries downloaded by development tools.
  # This does not activate recovered configuration or credentials.
  programs.nix-ld.enable = true;

  environment.systemPackages = with pkgs; [
    # Project runtimes. pnpm 10 is withheld: nixpkgs marks it insecure.
    # Meridian must receive a reviewed package-manager upgrade before use.
    nodejs_24
    bun
    deno
    python313
    uv

    # Native dependencies and build orchestration.
    gcc
    gnumake
    pkg-config
    openssl
    just

    # Version control, inspection, editing, and static checks.
    git
    git-lfs
    gh
    jq
    ripgrep
    fd
    fzf
    neovim
    shellcheck
    taplo
    nushell
    age
    sops
  ];
}
