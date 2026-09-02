{ config, lib, pkgs, ... }:

{
  # Keep this pilot package-only until each Dotter path is explicitly migrated.
  # This prevents Home Manager and Dotter from managing the same file.
  home.username = "juan";
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
        fsckObjects = false;
        prune = true;
      };
      transfer.fsckObjects = false;
      pack.threads = 0;
      http.postBuffer = 524288000;
      init.defaultBranch = "main";
      core = {
        excludesfile = "~/.gitignore_global";
        pager = "delta";
        autocrlf = "input";
        fsmonitor = true;
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

  # Migrated paths. Their former Dotter mappings are removed explicitly.
  home.file.".config/Brewfile".source = ../config/Brewfile;
  home.file.".config/nix/nix.conf".source = ../nix.conf;
  home.file.".config/nushell/config.nu".source = ../config/nushell/config.nu;
  home.file.".config/nushell/env.nu".source = ../config/nushell/env.nu;
  home.file.".config/nushell/login.nu".source = ../config/nushell/login.nu;
  home.file.".config/starship.toml".text = builtins.replaceStrings
    [ "{{hostname_color}}" ]
    [ "fg:#f7768e" ]
    (builtins.readFile ../starship.toml);
  home.file.".gitignore_global".source = ../gitignore_global;
  home.file.".local/bin/web-search".source = ../bin/web-search;
  home.file.".ssh/config".source = ../ssh_config;
  home.file.".config/nvim".source = ../config/nvim;
  home.file.".config/ghostty/config".source = ../config/ghostty/config;
  home.file.".config/mise/config.toml".source = ../config/mise/config.toml;
  home.file.".config/herdr/config.toml".source = ../config/herdr/config.toml;
  home.file.".config/ci".source = ../config/ci;
  home.file.".config/llama.cpp/.python-version".source = ../config/llama.cpp/.python-version;
  home.file.".config/llama.cpp/MODELS.md".source = ../config/llama.cpp/MODELS.md;
  home.file.".config/llama.cpp/README-windows.md".source = ../config/llama.cpp/README-windows.md;
  home.file.".config/llama.cpp/README.md".source = ../config/llama.cpp/README.md;
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
