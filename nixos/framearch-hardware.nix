{ config, lib, ... }:

let
  cfg = config.services.juan.framearchHardware;
in
{
  options.services.juan.framearchHardware = {
    enable = lib.mkEnableOption "the framearch AMD graphics baseline";

    user = lib.mkOption {
      type = lib.types.str;
      default = "juan";
      description = "Local user that needs GPU device access.";
    };

    kernelParams = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [
        "amdgpu.gttsize=-1"
        "amdgpu.vm_size=256"
        "amdgpu.noretry=0"
        "ttm.pages_limit=13631488"
        "ttm.page_pool_size=13631488"
        "nowatchdog"
        "nvme_load=YES"
        "zswap.enabled=0"
        "iommu=pt"
      ];
      description = "Current framearch kernel tuning; benchmark before changing host OS.";
    };

    enableModelStorage = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Mount the dedicated model filesystem when this hardware module is enabled.";
    };

    modelStorageDevice = lib.mkOption {
      type = lib.types.str;
      default = "/dev/disk/by-uuid/fcef66f9-3a98-42ff-83f6-890cb249a22e";
      description = "Stable device path for the dedicated model filesystem.";
    };

    modelStorageMountPoint = lib.mkOption {
      type = lib.types.str;
      default = "/mnt/ai_models";
      description = "Mount point for the dedicated model filesystem.";
    };
  };

  config = lib.mkIf cfg.enable {
    fileSystems = lib.mkIf cfg.enableModelStorage {
      ${cfg.modelStorageMountPoint} = {
        device = cfg.modelStorageDevice;
        fsType = "ext4";
        options = [ "nofail" ];
      };
    };
    hardware.graphics = {
      enable = true;
      enable32Bit = true;
    };

    boot.kernelModules = [ "amdgpu" ];
    boot.kernelParams = cfg.kernelParams;
    services.xserver.videoDrivers = lib.mkDefault [ "amdgpu" ];

    users.users.${cfg.user}.extraGroups = lib.mkAfter [ "render" "video" "audio" ];
  };
}
