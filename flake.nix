{
  description = "Juan's cross-platform user environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    herdr = {
      url = "github:herdrdev/herdr";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    sops-nix = {
      url = "github:Mic92/sops-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    cachy-llama = {
      url = "github:huaxel/UmaLLama/c1627fa4b8526fe146bccb3ca228f3dd0838517c";
      inputs.nixpkgs.follows = "nixpkgs";
      flake = true;
    };

    # nixgl is only needed for Vulkan smoke tests on the current Arch host.
    # Kept as an explicit input so it's available, but not pulled into the
    # flake evaluation graph for Darwin or non-Vulkan builds — the package is
    # only referenced in legacyPackages (evaluation-only), never in homeConfigurations.
    nixgl.url = "github:guibou/nixGL/b6105297e6f0cd041670c3e8628394d4ee247ed5";

    # Noctalia v5 desktop shell for the framearch niri experiment.
    # No `inputs.nixpkgs.follows` on purpose: upstream docs say following
    # disables their binary cache, which avoids compiling locally.
    noctalia.url = "github:noctalia-dev/noctalia";
  };

  outputs = { nixpkgs, home-manager, herdr, sops-nix, cachy-llama, nixgl, noctalia, ... }:
    let
      cachyLlamaVulkan = nixpkgs.legacyPackages.x86_64-linux.callPackage
        ./nixos/cachy-llama-package.nix {
          cachySource = cachy-llama.outPath;
          useVulkan = true;
        };

      # Upstream static release binary for aarch64-linux. Building herdr
      # from source fails there: the zig-built compiler_rt objects from
      # ghostty-vt are rejected by binutils ld.bfd ("overlapping FDEs" /
      # undefined symbols). Same approach as the pinned atuin release in
      # home/common.nix. The binary is the v0.9.3 tag; other systems keep
      # building the flake input (master, same Cargo version).
      herdrAarch64 = nixpkgs.legacyPackages.aarch64-linux.stdenv.mkDerivation {
        pname = "herdr";
        version = "0.9.3";
        src = nixpkgs.legacyPackages.aarch64-linux.fetchurl {
          url = "https://github.com/herdrdev/herdr/releases/download/v0.9.3/herdr-linux-aarch64";
          hash = "sha256-TeeqPiVniBLpKWDeZPfCqqG8ofD4CjxeVZg34jHh9cA=";
        };
        dontUnpack = true;
        installPhase = ''install -Dm755 $src $out/bin/herdr'';
        meta.mainProgram = "herdr";
      };

      mkAnsiblePlaybookApp = system:
        let ansible = nixpkgs.legacyPackages.${system}.ansible;
        in {
          type = "app";
          program = "${ansible}/bin/ansible-playbook";
          meta.description = "Pinned Ansible CLI for home-server operations";
        };

      mkHome = { system, hostModule }:
        home-manager.lib.homeManagerConfiguration {
          pkgs = import nixpkgs {
            inherit system;
            config.allowUnfree = true;
          };
          extraSpecialArgs = {
            herdrPackage = if system == "aarch64-linux" then herdrAarch64
                          else herdr.packages.${system}.default;
            # Only framearch (x86_64-linux) uses it; other hosts get null.
            # Lazy: never evaluated unless a host module references it.
            noctaliaPackage =
              if system == "x86_64-linux" && noctalia.packages ? x86_64-linux
              then noctalia.packages.x86_64-linux.default
              else null;
            # nixGL wrapper so nix OpenGL apps (Noctalia) run on this Arch
            # host's mesa. Linux-only: nixgl has no darwin packages.
            nixGLIntelPackage =
              if builtins.elem system [ "x86_64-linux" "aarch64-linux" ]
              then nixgl.packages.${system}.nixGLIntel
              else null;
          };
          modules = [
            sops-nix.homeManagerModules.sops
            ./home/common.nix
            hostModule
          ];
        };

      # Minimal server-user profiles intentionally avoid the workstation
      # common module, its secrets, activation hooks, and developer toolchain.
      mkMinimalServerHome = system:
        home-manager.lib.homeManagerConfiguration {
          pkgs = nixpkgs.legacyPackages.${system};
          modules = [ ./home/server-minimal.nix ];
        };

    in {
      # Kept under legacyPackages so `nix flake check` validates the module
      # without compiling the large Vulkan/WebUI derivation on every change.
      legacyPackages.x86_64-linux.cachyLlamaVulkan = cachyLlamaVulkan;
      legacyPackages.x86_64-linux.nixVulkanIntel =
        nixgl.packages.x86_64-linux.nixVulkanIntel;

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
      apps.aarch64-linux.home-manager = {
        type = "app";
        program = "${home-manager.packages.aarch64-linux.default}/bin/home-manager";
        meta.description = "Locked Home Manager activation tool";
      };

      apps.x86_64-linux.ansible-playbook = mkAnsiblePlaybookApp "x86_64-linux";
      apps.aarch64-linux.ansible-playbook = mkAnsiblePlaybookApp "aarch64-linux";
      apps.aarch64-darwin.ansible-playbook = mkAnsiblePlaybookApp "aarch64-darwin";

      # Toolchain for public/fork CI. The gate validates encrypted SOPS
      # metadata but never decrypts files or receives an age key.
      devShells.x86_64-linux.ci = let
        pkgs = nixpkgs.legacyPackages.x86_64-linux;
        python = pkgs.python3.withPackages (ps: [ ps.pyyaml ]);
      in pkgs.mkShell {
        packages = with pkgs; [
          bun
          deno
          just
          jq
          nodejs
          nushell
          python
          rsync
          ruby
          shellcheck
        ];
      };

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

        "juan@liedelpi" = mkHome {
          system = "aarch64-linux";
          hostModule = ./home/liedelpi.nix;
        };

        # Draft-only outputs; these are build-checked but not activated.
        "juan@lenovo-lola" = mkMinimalServerHome "x86_64-linux";
        "juan@acerpepe" = mkMinimalServerHome "x86_64-linux";
      };
    };
}
