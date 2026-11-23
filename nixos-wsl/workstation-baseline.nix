{ pkgs, ... }:
let
  starshipNu = pkgs.runCommand "workstation-starship.nu" {} ''
    export HOME="$TMPDIR"
    ${pkgs.starship}/bin/starship init nu > "$out"
  '';
  zoxideNu = pkgs.runCommand "workstation-zoxide.nu" {} ''
    ${pkgs.zoxide}/bin/zoxide init nushell > "$out"
  '';
in {
  environment.systemPackages = with pkgs; [ starship zoxide eza bat btop duf ];
  environment.localBinInPath = true;
  environment.variables = {
    EDITOR = "nvim";
    VISUAL = "nvim";
    PAGER = "less";
  };

  # Interactive only: automation and noninteractive Bash remain unchanged.
  programs.bash.interactiveShellInit = ''
    eval "$(${pkgs.starship}/bin/starship init bash)"
    eval "$(${pkgs.zoxide}/bin/zoxide init bash)"
    alias ll='eza -la --group-directories-first'
    alias la='eza -a --group-directories-first'
    alias lt='eza --tree'
    alias v='nvim'
    alias gs='git status'
    alias gd='git diff'
  '';

  # No environment.d loader, private histories, Pi setup, or remote services.
  environment.etc."workstation/config.nu".text = ''
    $env.config.show_banner = false
    $env.config.edit_mode = "vi"
    $env.config.history.file_format = "sqlite"
    $env.config.history.max_size = 100000
    $env.config.completions.case_sensitive = false
    $env.PATH = ($env.PATH | prepend ($env.HOME | path join ".local/bin") | uniq)
    source ${starshipNu}
    source ${zoxideNu}
    alias ll = eza -la --group-directories-first
    alias la = eza -a --group-directories-first
    alias lt = eza --tree
    alias v = nvim
    alias gs = git status
    alias gd = git diff
  '';

  # Deliberately no LazyVim bootstrap or stale ~/.neovim-venv dependency.
  environment.etc."workstation/init.lua".text = ''
    vim.opt.number = true
    vim.opt.relativenumber = true
    vim.opt.expandtab = true
    vim.opt.tabstop = 2
    vim.opt.shiftwidth = 2
    vim.opt.ignorecase = true
    vim.opt.smartcase = true
    vim.opt.termguicolors = true
    vim.opt.signcolumn = "yes"
    vim.opt.updatetime = 250
    vim.cmd.colorscheme("habamax")
  '';
}
