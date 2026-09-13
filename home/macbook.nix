{ ... }:

{
  home.username = "juanbenjumea";
  home.homeDirectory = "/Users/juanbenjumea";

  home.file.".config/llama.cpp/models-macbook.ini".source = ../config/llama.cpp/models-macbook.ini;
  home.file.".aerospace.toml".source = ../aerospace;
  home.file.".config/borders".source = ../config-macos/borders;

  home.sessionVariables = {
    PI_CODING_AGENT_DIR = "/Users/juanbenjumea/dotfiles/pi/agent";
    PRIME_AGENT_CODING_AGENT_DIR = "/Users/juanbenjumea/prime-agent/agent";
  };
}
