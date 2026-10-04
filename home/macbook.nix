{ config, lib, ... }:

{
  home.username = "juanbenjumea";
  home.homeDirectory = "/Users/juanbenjumea";

  # sops-nix currently bootstraps immediately after an asynchronous bootout.
  # Match Home Manager's unload strategy until upstream waits as well.
  home.activation.sops-nix = lib.mkForce ''
    sopsDomain="gui/$(id -u ${lib.escapeShellArg config.home.username})"
    sopsService="$sopsDomain/org.nix-community.home.sops-nix"
    if /bin/launchctl print "$sopsService" >/dev/null 2>&1; then
      if [[ "$(/usr/bin/sw_vers -productVersion | cut -d. -f1)" -ge 26 ]]; then
        run /bin/launchctl bootout --wait "$sopsService"
      else
        run /bin/launchctl bootout "$sopsService"
        run sleep 1
      fi
    fi
    run /bin/launchctl bootstrap "$sopsDomain" \
      ${lib.escapeShellArg "${config.home.homeDirectory}/Library/LaunchAgents/org.nix-community.home.sops-nix.plist"}
    unset sopsDomain sopsService
  '';

  home.file.".config/llama.cpp/models-macbook.ini".source = ../config/llama.cpp/models-macbook.ini;
  home.file.".aerospace.toml".source = ../aerospace;
  home.file.".config/borders".source = ../config-macos/borders;

  home.sessionVariables = {
    PI_CODING_AGENT_DIR = "/Users/juanbenjumea/dotfiles/pi/agent";
    PI_CODING_AGENT_SESSION_DIR = "/Users/juanbenjumea/dotfiles/pi/agent/sessions";
    PRIME_AGENT_CODING_AGENT_DIR = "/Users/juanbenjumea/prime-agent/agent";
    ATOM_DATA_ROOT = "/Volumes/arch-wsl/mnt/c/Users/jbenjumeamoreno/atom-data";
  };
}
