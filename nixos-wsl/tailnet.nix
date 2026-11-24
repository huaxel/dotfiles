{ pkgs, ... }:

{
  # Tailnet access for this WSL host. Authentication is manual: after the first
  # rebuild run `sudo tailscale up` and approve the device in the admin console.
  networking.hostName = "nixos-wsl";
  services.tailscale.enable = true;
  networking.firewall.trustedInterfaces = [ "tailscale0" ];
  environment.systemPackages = [ pkgs.tailscale ];
}
