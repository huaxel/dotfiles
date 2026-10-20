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
  networking.useDHCP = true;

  # Keep the host self-sufficient for flake-based rebuilds after installation.
  nix.settings.experimental-features = [ "nix-command" "flakes" ];

  nixpkgs.config.allowUnfree = true;

  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = false;

  # The disposable installation should label its root filesystem `nixos`.
  # The model disk remains a separate nofail mount below.
  fileSystems."/" = {
    device = "/dev/disk/by-label/nixos";
    fsType = "ext4";
  };

  services.tailscale = {
    enable = true;
    openFirewall = true;
  };

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

  # Niri replaces sway on this host. Greetd starts niri-session directly;
  # pick framearch (niri) at the TTY — no other greeter is configured.
  # NOTE: set a password for juan (`passwd juan`) after install, or no
  # graphical or console login will succeed.
  programs.niri.enable = true;

  services.greetd = {
    enable = true;
    settings.default_session = {
      command = "${pkgs.niri}/bin/niri-session";
      user = "juan";
    };
  };

  # NixOS otherwise injects a stripped PATH via Environment= on the
  # niri.service unit which shadows the imported user-manager PATH.
  systemd.user.services.niri.enableDefaultPath = false;

  security.polkit.enable = true;
  services.gnome.gnome-keyring.enable = true;
  security.pam.services.swaylock = {};
  programs.steam.enable = true;

  # Audio for the media keys (PipeWire + WirePlumber for wpctl).
  services.pipewire = {
    enable = true;
    alsa.enable = true;
    pulse.enable = true;
  };

  # Custom Colemak layout (mac_colemak) for niri's libxkbcommon lookup.
  # VERIFY ON FIRST LOGIN: if niri fails to start, check
  # `journalctl --user-unit=niri -b` for keymap errors and temporarily
  # switch config-linux/niri/config.kdl to layout "us,gb".
  services.xserver.xkb.extraLayouts.mac_colemak = {
    description = "Colemak with Mac-style modifiers";
    languages = [ "eng" ];
    symbolsFile = ../config-linux/xkb/symbols/mac_colemak;
  };

  environment.systemPackages = with pkgs; [
    git
    vim
    ghostty
    walker
    elephant
    fuzzel
    wofi
    waybar
    mako
    swayidle
    swaylock-effects
    wl-clipboard
    cliphist
    grimblast
    slurp
    playerctl
    wireplumber
    brightnessctl
    wtype
    xwayland-satellite
    swaybg
    polkit_gnome
    jq
    networkmanagerapplet
  ];
}
