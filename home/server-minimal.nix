# Build-only seed for headless Debian home-server users.
# Keep this separate from common.nix: no developer toolchain, user file mappings,
# secrets, custom activation hooks, or services without host-specific review.
{ ... }:
{
  home.username = "juan";
  home.homeDirectory = "/home/juan";
  home.stateVersion = "24.11";

  # Makes Home Manager available within this user's Nix profile. This module
  # deliberately manages no other package, file, service, or host setting.
  programs.home-manager.enable = true;
}
