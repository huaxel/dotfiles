{
  description = "Juan's cross-platform user environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    sops-nix = {
      url = "github:Mic92/sops-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    # The physical host currently runs this fork, not nixpkgs' llama.cpp.
    # Keep the exact build source pinned while packaging is validated.
    cachy-llama = {
      url = "github:fewtarius/CachyLLama/c1627fa4b8526fe146bccb3ca228f3dd0838517c";
      inputs.nixpkgs.follows = "nixpkgs";
      flake = true;
    };

    # Required only for Vulkan diagnostics on the current non-NixOS Arch host.
    nixgl.url = "github:guibou/nixGL/b6105297e6f0cd041670c3e8628394d4ee247ed5";
  };

  outputs = { nixpkgs, home-manager, sops-nix, cachy-llama, nixgl, ... }:
    let
      mkHome = { system, hostModule }:
        home-manager.lib.homeManagerConfiguration {
          pkgs = import nixpkgs {
            inherit system;
            config.allowUnfree = true;
          };
          modules = [
            sops-nix.homeManagerModules.sops
            ./home/common.nix
            hostModule
          ];
        };
    in {
      # Kept under legacyPackages so `nix flake check` validates the module
      # without compiling the large Vulkan/WebUI derivation on every change.
      legacyPackages.x86_64-linux.cachyLlamaVulkan =
        cachy-llama.packages.x86_64-linux.vulkan;
      legacyPackages.x86_64-linux.nixVulkanIntel =
        nixgl.packages.x86_64-linux.nixVulkanIntel;

      nixosModules.framearchAi = ./nixos/framearch-ai.nix;
      nixosModules.framearchHardware = ./nixos/framearch-hardware.nix;

      apps.x86_64-linux.home-manager = {
        type = "app";
        program = "${home-manager.packages.x86_64-linux.default}/bin/home-manager";
        meta.description = "Locked Home Manager activation tool";
      };
      apps.aarch64-darwin.home-manager = {
        type = "app";
        program = "${home-manager.packages.aarch64-darwin.default}/bin/home-manager";
        meta.description = "Locked Home Manager activation tool";
      };

      checks.x86_64-linux.framearchNixos =
        let
          evaluated = nixpkgs.lib.nixosSystem {
            system = "x86_64-linux";
            modules = [
              ./nixos/framearch-ai.nix
              ./nixos/framearch-hardware.nix
              {
                services.juan.framearchAi = {
                  enable = true;
                  package = cachy-llama.packages.x86_64-linux.vulkan;
                  enablePortForward = true;
                };
                services.juan.framearchHardware = {
                  enable = true;
                  enableModelStorage = true;
                };
              }
            ];
          };
          ai = evaluated.config.services.juan.framearchAi;
          embedding = evaluated.config.systemd.services.memoryfield-embed;
          embeddingService = embedding.serviceConfig;
          portForward = evaluated.config.systemd.services.port-forward-llama.serviceConfig;
        in
        assert evaluated.config.hardware.graphics.enable;
        assert evaluated.config.fileSystems."/mnt/ai_models".device == "/dev/disk/by-uuid/fcef66f9-3a98-42ff-83f6-890cb249a22e";
        assert evaluated.config.systemd.services."llama.cpp".serviceConfig.User == "juan";
        assert evaluated.config.systemd.services."llama.cpp".serviceConfig.ExecStart == "${cachy-llama.packages.x86_64-linux.vulkan}/bin/llama-server";
        assert embeddingService.User == "juan";
        assert embeddingService.Group == "users";
        assert builtins.elem "tailscaled.service" embedding.after;
        assert portForward.User == "juan";
        assert portForward.AmbientCapabilities == [ "CAP_NET_BIND_SERVICE" ];
        assert ai.modelsPreset == "/home/juan/.config/llama.cpp/models.ini";
        nixpkgs.legacyPackages.x86_64-linux.runCommand "framearch-nixos-module-check" { } ''
          touch $out
        '';

      homeConfigurations = {
        "juan@framearch" = mkHome {
          system = "x86_64-linux";
          hostModule = ./home/framearch.nix;
        };

        "juan@arch-wsl" = mkHome {
          system = "x86_64-linux";
          hostModule = ./home/arch-wsl.nix;
        };

        "juan@macbook" = mkHome {
          system = "aarch64-darwin";
          hostModule = ./home/macbook.nix;
        };
      };
    };
}
