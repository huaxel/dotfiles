{ config, pkgs, cachyLlamaPackage, ... }:

{
  imports = [
    ./framearch-ai.nix
    ./framearch-hardware.nix
  ];

  # This host is intended for a separate disk or disposable VM first. It is
  # not a replacement configuration for the running Arch installation.
  system.stateVersion = "25.11";
  networking.hostName = "framearch-nixos";

  nixpkgs.config.allowUnfree = true;

  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = false;

  # The disposable installation should label its root filesystem `nixos`.
  # The model disk remains a separate nofail mount below.
  fileSystems."/" = {
    device = "/dev/disk/by-label/nixos";
    fsType = "ext4";
  };

  services.tailscale.enable = true;

  users.users.juan = {
    isNormalUser = true;
    description = "Juan Benjumea";
    home = "/home/juan";
    extraGroups = [ "wheel" ];
  };

  services.juan.framearchHardware = {
    enable = true;
    enableModelStorage = true;
  };

  services.juan.framearchAi = {
    enable = true;
    package = cachyLlamaPackage;
    enablePortForward = true;
    portForwardTarget = "192.168.1.138:32657";
  };

  environment.systemPackages = [ pkgs.git pkgs.vim ];
}
