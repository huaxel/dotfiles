{ config, lib, pkgs, ... }:

# Nix-provided rustc/cargo for hosts without rustup. Where rustup is installed,
# disable this: ~/.nix-profile/bin comes before ~/.cargo/bin on PATH, so a nix
# rustc shadows the rustup proxies and every project's rust-toolchain pin is
# silently ignored (on framearch, Tenderpad's 1.88.0 pin built with 1.99 and
# mixed incompatible artifacts in one target dir, E0514).
{
  options.dotfiles.nixRust.enable = lib.mkOption {
    type = lib.types.bool;
    default = true;
    description = "Install rustc and cargo from nixpkgs; disable where rustup provides the toolchain.";
  };

  config.home.packages = lib.mkIf config.dotfiles.nixRust.enable [
    pkgs.rustc
    pkgs.cargo
  ];
}
