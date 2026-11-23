# Edit this configuration file to define what should be installed on
# your system. Help is available in the configuration.nix(5) man page, on
# https://search.nixos.org/options and in the NixOS manual (`nixos-help`).

# NixOS-WSL specific options are documented on the NixOS-WSL repository:
# https://github.com/nix-community/NixOS-WSL

{ config, lib, pkgs, ... }:

{
  imports = [
    # include NixOS-WSL modules
    <nixos-wsl/modules>
    ./development-tools.nix
    ./workstation-baseline.nix
    ./arch-tools.nix
    ./tailnet.nix
  ];

  wsl.enable = true;
  wsl.defaultUser = "juan";
  users.users.juan.uid = 1001;
  # Keep the user's systemd instance (and the Rex personal server) alive
  # between logins; mirrors the imperative `loginctl enable-linger`.
  users.users.juan.linger = true;

  # swap is emergency-only on this host (see .wslconfig: swap=16GB, and the
  # OOM-killer-over-thrash rationale there). The kernel default of 60 pages
  # anonymous memory out aggressively, which defeats that intent.
  boot.kernel.sysctl."vm.swappiness" = 10;

  # Preserve the original account and its home.
  users.users.nixos = {
    isNormalUser = true;
    uid = 1000;
    extraGroups = [ "wheel" ];
  };


  # This value determines the NixOS release from which the default
  # settings for stateful data, like file locations and database versions
  # on your system were taken. It's perfectly fine and recommended to leave
  # this value at the release version of the first install of this system.
  # Before changing this value read the documentation for this option
  # (e.g. man configuration.nix or on https://nixos.org/nixos/options.html).
  system.stateVersion = "26.05"; # Did you read the comment?
}
