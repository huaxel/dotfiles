# Home-server Ansible inventory

This is the SSH inventory and **read-only discovery audit** for `lenovo-lola`,
`acerpepe`, and `liedelpi`. It is a starting point for coordinated host
management, not a declaration that the machines should run identical services.

Home Manager remains responsible for user-level configuration. The inventory
currently declares connection settings only; it does not install packages,
change services, alter firewall rules, or manage application workloads. K3s
remains scoped to Liedelpi unless a later, separately reviewed decision changes
that boundary. Application deployment and edge-routing ownership is documented
in the [Tailnet service map](../selfhost/TAILNET-MAP.md); this workflow does not
change Caddy/Tailscale Serve, Docker, or K3s application state.

## Run the read-only audit

From the dotfiles repository root, use the Ansible CLI from this repository's
pinned Nixpkgs input:

```bash
nix run .#ansible-playbook -- -i infra/ansible/hosts.yml infra/ansible/audit.yml
```

For the complete read-only workflow (syntax checks, discovery audit, and
approved baseline verification), run `just home-servers-check` from the
repository root.

The public inventory uses the existing short SSH aliases rather than publishing
the private Tailscale DNS suffix. The controller must have working SSH entries
for `lenovo-lola`, `acerpepe`, and `liedelpi`, with strict host-key checking.
Lola's existing key is recorded under its short host name, so its entry also
uses `HostKeyAlias=lenovo-lola`. Each host was verified to have `/usr/bin/bash`;
the playbook invokes that fixed path because Acer Pepe and Liedelpi use Nushell
as their SSH login shell. If Bash is missing, the audit fails rather than
installing or changing anything.

The playbook uses Ansible's `raw` module, disables fact gathering and Ansible
privilege escalation, and executes only bounded reporting commands. This avoids
module uploads and temporary remote files. It uses `sudo -n` only for
read-only UFW, packet-filter, and K3s metadata queries; it never invokes package,
file, firewall, or service-state changes.
`systemctl` is used only for status queries, which may perform normal
systemd/D-Bus lazy metadata handling; `changed=0` is expected.

The report covers OS/kernel, uptime/load, memory, block-device and mount
metadata, failed systemd units, TCP listeners, UFW policy, IPv4/IPv6 forwarding
switches and FORWARD-chain default policies, redacted PREROUTING REDIRECT rules
with packet counters, read-only K3s service/NodePort and Docker-published-port
listings where those runtimes are active, core/host service states, and whether
the Ansible user has a valid Home Manager generation link. Home Manager discovery
is informational; the audit does not require profiles on hosts that do not use it.
Forwarding and redirect counters describe local rules, not successful connections
or end-to-end reachability. The audit does not read application data,
service logs, secrets, or general filesystem contents. Mutating operations must use separate, reviewed playbooks rather than this
audit.

## CI JIT dispatcher deployment

`deploy-ci-jit.yml` is a separate mutating playbook for the `ci_jit` inventory
(grouping the three home servers plus local Framearch). It verifies the official
x64/ARM64 archive checksum, creates separate `ci-jit-dispatcher` and
`actions-runner` accounts, and manages only JIT dispatcher files and its
systemd unit. The dispatcher PAT remains readable only by its service account;
a narrowly scoped sudoers rule permits it to launch and clean up jobs as the
unprivileged runner user.

Host allowlists are SOPS-encrypted under `secrets/ci-jit-repos.<host>.enc`.
The controller decrypts them in memory without logging plaintext and installs
them with dispatcher-only group access. The playbook checks the token file's
presence, mode, and size without reading its contents; it transfers ownership
to the dispatcher account. It checks both the new and legacy JIT state paths
before stopping a host with an active claim. It does not remove or reconfigure
persistent runners, Home Manager profiles, K3s, application services,
firewalls, or DNS.

The initial 2026-10-30 rollout used the earlier shared-UID layout. The
isolated-account migration described above was explicitly authorized, deployed
to all four hosts on 2026-10-30, and verified: dispatcher services run as
`ci-jit-dispatcher`, jobs run as `actions-runner`, and token/allowlist
permissions match the intended boundary. Read-only queued-runs API probes
succeeded for every configured allowlist on every host. A controlled manual
workflow dispatch also completed successfully on Liedelpi through the ARM64/JIT
route; its ephemeral runner registration and job state were cleaned up, and the
dispatcher remained active with zero restarts. The playbook must not be run
without explicit authorization. The obsolete public `liedelpi-ci` registration
was separately unregistered and its systemd unit disabled with owner
authorization; this playbook does not remove persistent runner registrations.
See the [dispatcher operations guide](../ci-dispatcher/README.md) for current
allowlists and status.

## Verify the fleet baseline

`verify-fleet.yml` checks that SSH and Tailscale are enabled and active on all
three hosts, requires UFW to be active with deny-incoming/allow-outgoing
defaults, asserts that K3s remains enabled only on Liedelpi, and verifies the
current ext4 data mounts against their persistent UUID-based `fstab` entries
with `nofail` (`/data` on Lola and Acer Pepe; `/mnt/wd-blue` on Liedelpi). The
firewall check deliberately leaves all per-host allow rules and routed policies
unconstrained. It then imports Lola-specific assertions in `verify-lola.yml`.
The K3s boundary
matches the existing self-host architecture: Liedelpi is the live K3s host, and
K3s remains scoped there. Lola's assertions cover settings the owner explicitly
approved: text-mode boot with GNOME retained but the graphical target and
standard display managers inactive, persistent `/data` by UUID,
SSH/Tailscale/Cockpit availability,
Cockpit restricted to Tailscale in UFW, and stopped/disabled printing,
Bluetooth, modem, and Avahi services. These are read-only checks; they do not
converge state or make changes. Run the fleet check with:

```bash
nix run .#ansible-playbook -- -i infra/ansible/hosts.yml infra/ansible/verify-fleet.yml
```

To check only Lola's profile, run `verify-lola.yml` directly. No desired
application services are inferred for Acer Pepe or Liedelpi from their current
state.
