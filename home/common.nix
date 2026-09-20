{ config, lib, pkgs, herdrPackage ? pkgs.herdr, ... }:

let
  # The Nixpkgs Atuin package currently lags the database migration already
  # applied locally (20260818000000). Pin the upstream release that contains
  # that migration instead of making Atuin downgrade or editing SQLite state.
  atuinRelease = {
    "aarch64-darwin" = {
      archive = "atuin-aarch64-apple-darwin.tar.gz";
      directory = "atuin-aarch64-apple-darwin";
      hash = "sha256-x4rBWcicOO4LVutqEdnApzQN46A7mPu8zUT44tkebm4=";
    };
    "aarch64-linux" = {
      archive = "atuin-aarch64-unknown-linux-gnu.tar.gz";
      directory = "atuin-aarch64-unknown-linux-gnu";
      hash = "sha256-297if3/Ge5LncNGvidO0IQUUmaBYzT5GmNEj4BF/qVA=";
    };
    "x86_64-darwin" = {
      archive = "atuin-x86_64-apple-darwin.tar.gz";
      directory = "atuin-x86_64-apple-darwin";
      hash = "sha256-dO/RCwi/IeXpRI5LTC/OmZXGVZKImbA3VBHUJ77Dw0c=";
    };
    "x86_64-linux" = {
      archive = "atuin-x86_64-unknown-linux-gnu.tar.gz";
      directory = "atuin-x86_64-unknown-linux-gnu";
      hash = "sha256-Q02CtMX2kbbwQj8wpLkx30r97RmwWnlaKAGS/fimGi0=";
    };
  };
  atuin = let
    system = pkgs.stdenv.hostPlatform.system;
    release = builtins.getAttr system atuinRelease;
  in pkgs.stdenv.mkDerivation {
    pname = "atuin";
    version = "18.21.0";
    src = pkgs.fetchurl {
      url = "https://github.com/atuinsh/atuin/releases/download/v18.21.0/${release.archive}";
      hash = release.hash;
    };
    dontUnpack = true;
    installPhase = ''
      tar -xzf "$src" -C "$TMPDIR"
      install -Dm755 "$TMPDIR/${release.directory}/atuin" "$out/bin/atuin"
    '';
  };
in
{
  # Home Manager is the sole Unix user-configuration owner.
  # Linux profiles use the historical `juan` account; host modules may
  # override this for machines with a different local username.
  home.username = lib.mkDefault "juan";
  home.homeDirectory = lib.mkDefault (
    if pkgs.stdenv.hostPlatform.isDarwin then "/Users/juan" else "/home/juan"
  );
  home.stateVersion = "24.11";

  home.packages = with pkgs; [
    age
    atuin
    bun
    bat
    btop
    eza
    fd
    fzf
    gh
    git
    delta
    git-lfs
    glow
    jq
    just
    lazygit
    neovim
    nushell
    ripgrep
    sops
    starship
    deno
    mise
    pnpm
    shellcheck
    taplo
    uv
    yazi
    zoxide
  ];

  programs.git = {
    enable = true;
    lfs.enable = !pkgs.stdenv.hostPlatform.isDarwin;
    settings = {
      user = {
        name = "Juan Benjumea";
        email = "benjumeamoreno@gmail.com";
      };
      credential.helper = if pkgs.stdenv.hostPlatform.isDarwin then "osxkeychain" else "cache";
      fetch = {
        fsckObjects = true;
        prune = true;
      };
      transfer.fsckObjects = true;
      pack.threads = 0;
      http.postBuffer = 524288000;
      init.defaultBranch = "main";
      core = {
        excludesfile = "~/.gitignore_global";
        pager = "delta";
        autocrlf = "input";
        # Git fsmonitor can exhaust the host's inotify instance limit when
        # many worktrees/processes are active.
        fsmonitor = false;
      };
      interactive.diffFilter = "delta --color-only";
      delta = {
        navigate = true;
        light = false;
        side-by-side = false;
        line-numbers = true;
        hyperlinks = true;
        hyperlinks-commit-link-format = true;
      };
      merge.conflictstyle = "diff3";
      diff = {
        colorMoved = "default";
        colorMovedWS = "allow-indentation-change";
      };
      filter."strip-pi-machine-config" = {
        clean = "node scripts/strip-pi-machine-config.mjs";
        # smudge is required for fresh clones: `required = true` with a missing
        # smudge makes checkout fail before bootstrap runs. The committed blob
        # is already machine-stripped, so `cat` is the correct pass-through.
        smudge = "cat";
        required = true;
      };
      push.autoSetupRemote = true;
      pull.rebase = true;
      rebase.autoStash = true;
      alias = {
        lg = "log --color --graph --pretty=format:'%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --abbrev-commit";
        st = "status -sb";
        co = "checkout";
        br = "branch";
        ci = "commit";
        undo = "reset --soft HEAD~1";
        amend = "commit --amend --no-edit";
        rbc = "rebase --continue --no-edit";
        unstage = "reset HEAD --";
        last = "log -1 HEAD --stat";
      };
    };
  };

  home.sessionPath = [ "${config.home.homeDirectory}/.nix-profile/bin" ];

  home.sessionVariables = {
    EDITOR = "nvim";
    VISUAL = "nvim";
    PAGER = "less";
    MISE_LOG_LEVEL = "error";
  };

  programs.home-manager.enable = true;

  # Keep Herdr on its upstream flake input so it can be updated independently
  # from the rest of nixpkgs. The native module also reloads its settings.
  programs.herdr = {
    enable = true;
    package = herdrPackage;
    settings = lib.importTOML ../config/herdr/config.toml;
  };

  # Plugin registrations are per-user state, so install them after the Nix
  # profile is available. The script is idempotent and works on fresh hosts.
  home.activation.herdrPlugins = lib.hm.dag.entryAfter [ "installPackages" ] ''
    PATH="${herdrPackage}/bin:$PATH" ${../scripts/setup-herdr-plugins.sh}
  '';

  # Shared Unix configuration paths.
  home.file.".config/Brewfile".source = ../config/Brewfile;
  home.file.".config/nix/nix.conf".source = ../nix.conf;
  home.file.".config/nushell/config.nu".source = ../config/nushell/config.nu;
  home.file.".config/nushell/env.nu".source = ../config/nushell/env.nu;
  home.file.".config/nushell/login.nu".source = ../config/nushell/login.nu;
  # Nushell uses ~/Library/Application Support/nushell on macOS unless it is
  # started with --config-home. Keep that native location in sync with the
  # XDG-style path above so Terminal-launched Nushell loads these dotfiles.
  home.file."Library/Application Support/nushell/config.nu" = lib.mkIf pkgs.stdenv.hostPlatform.isDarwin {
    source = ../config/nushell/config.nu;
  };
  home.file."Library/Application Support/nushell/env.nu" = lib.mkIf pkgs.stdenv.hostPlatform.isDarwin {
    source = ../config/nushell/env.nu;
  };
  home.file."Library/Application Support/nushell/login.nu" = lib.mkIf pkgs.stdenv.hostPlatform.isDarwin {
    source = ../config/nushell/login.nu;
  };
  home.file.".config/starship.toml".text = builtins.replaceStrings
    [ "{{hostname_color}}" ]
    [ "fg:#f7768e" ]
    (builtins.readFile ../starship.toml);
  home.file.".npmrc".source =
    config.lib.file.mkOutOfStoreSymlink
      "${config.home.homeDirectory}/dotfiles/npmrc";
  home.file.".gitignore_global".source = ../gitignore_global;
  home.file.".local/bin/web-search".source = ../bin/web-search;
  home.file.".ssh/config".source = ../ssh_config;
  home.file.".config/nvim".source = ../config/nvim;
  home.file.".config/htop".source = ../config/htop;

  home.activation.renderLlamaModels = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    AWK=${pkgs.gawk}/bin/awk ${pkgs.bash}/bin/bash ${../scripts/render-llama-models.sh} \
      ${if pkgs.stdenv.hostPlatform.isDarwin then "macos" else "linux"} \
      ${if pkgs.stdenv.hostPlatform.isDarwin then "${config.home.homeDirectory}/.cache/huggingface/hub" else "/mnt/ai_models/models"} \
      "${config.home.homeDirectory}/.config/llama.cpp/models.ini" \
      ${../llama-models.ini}
  '';

  # Pi fallback config: when launched without PI_CODING_AGENT_DIR (bash/cron/
  # systemd/subprocesses with a reset env), pi reads ~/.pi/agent/settings.json.
  # Symlink it to the tracked source so the fallback matches the live config.
  # Home Manager provisions the link on Unix. The
  # strip-pi-machine-config git clean filter keeps machine-local fields out
  # of git, so pi writing back through the link creates no git noise.
  # (auth.json is NOT managed here — it is gitignored per-machine and created
  # ad-hoc after `/login openai-codex`.)
  home.file.".pi/agent/settings.json".source =
    config.lib.file.mkOutOfStoreSymlink
      "${config.home.homeDirectory}/dotfiles/pi/agent/settings.json";
  home.file.".config/ghostty/config".source = ../config/ghostty/config;
  home.file.".config/mise/config.toml".source = ../config/mise/config.toml;
  home.file.".config/llama.cpp/.python-version".source = ../config/llama.cpp/.python-version;
  home.file.".config/llama.cpp/MODELS.md".source = ../config/llama.cpp/MODELS.md;
  home.file.".config/llama.cpp/README-windows.md".source = ../config/llama.cpp/README-windows.md;
  home.file.".config/llama.cpp/download-models.py".source = ../config/llama.cpp/download-models.py;
  home.file.".config/llama.cpp/main.py".source = ../config/llama.cpp/main.py;
  home.file.".config/llama.cpp/mcp-servers.json".source = ../config/llama.cpp/mcp-servers.json;
  home.file.".config/llama.cpp/pyproject.toml".source = ../config/llama.cpp/pyproject.toml;
  home.file.".config/llama.cpp/start-server.ps1".source = ../config/llama.cpp/start-server.ps1;
  home.file.".config/llama.cpp/sync-mcp-configs.py".source = ../config/llama.cpp/sync-mcp-configs.py;
  home.file.".config/llama.cpp/tests/test_download_models_structure.py".source = ../config/llama.cpp/tests/test_download_models_structure.py;
  home.file.".config/llama.cpp/uv.lock".source = ../config/llama.cpp/uv.lock;
  home.file.".config/zed/keymap.json".source = ../config/zed/keymap.json;
  home.file.".config/bat".source = ../config/bat;
  home.file.".config/btop".source = ../config/btop;
  home.file.".config/eza".source = ../config/eza;
  home.file.".config/fastfetch".source = ../config/fastfetch;
  home.file.".config/icons.sh".source = ../config/icons.sh;
  home.file.".config/fish/config.fish".source = ../config/fish/config.fish;
  home.file.".config/kitty/kitty.conf".source = ../config/kitty/kitty.conf;
  home.file.".config/markdownlint/.markdownlint-cli2.yaml".source = ../config/markdownlint/.markdownlint-cli2.yaml;

  sops = {
    age.keyFile = "${config.home.homeDirectory}/.config/sops/age/keys.txt";
    secrets = {
      environment = {
        format = "binary";
        sopsFile = ../secrets/environment.d.enc;
        path = "${config.home.homeDirectory}/.config/environment.d/99-environment.conf";
        mode = "0600";
      };
      "llama-webui-config" = {
        format = "binary";
        sopsFile = ../secrets/llama-webui-config.json.enc;
        path = "${config.home.homeDirectory}/.config/llama.cpp/webui-config.json";
        mode = "0600";
      };
      "pi-quota-sessions" = {
        format = "binary";
        sopsFile = ../secrets/pi-quota-sessions.json.enc;
        path = "${config.home.homeDirectory}/dotfiles/pi/agent/quota-sessions.json";
        mode = "0600";
      };
    };
  };
}
