# Niri on framearch

From a TTY, start the desktop with `niri-session`, not bare `niri`.
Alternatively select the Niri session in a display manager. Session startup
imports the Wayland environment into systemd/D-Bus and manages graphical-session
services. Bare `niri` is not a supported full desktop startup: it leaves portal
services without the display environment and graphical-session target. Do not
import the environment from an asynchronous startup hook; portal consumers can
race it. The installed `niri-session` launcher handles lifecycle and ordering.

On the current Arch/CachyOS host, install `xdg-desktop-portal-gnome` and
`xdg-desktop-portal-gtk` alongside `xdg-desktop-portal`. Niri screen sharing uses
the GNOME backend, not the wlroots backend. Home Manager installs this directory's
`portals.conf` for framearch only; GTK remains the file chooser backend.

Apply repository configuration with `just nix-switch juan@framearch`.
Startup commands run at compositor startup, not on config reload. After changing
portal routing, log out/in to refresh the session, or import the current Niri
child environment, activate `graphical-session.target` (required by the GNOME
backend), and restart the portal services deliberately. This current-session
repair does not attach lifecycle management to an already-running bare Niri;
use `niri-session` on the next login. Niri also starts its
`org.gnome.Mutter.ScreenCast` D-Bus service only in session mode: repairing the
portal processes cannot add capture support to an existing bare-Niri process.
A logout/login through `niri-session` is required for that case. Restarting portals
can interrupt active screen sharing and file dialogs.

Checks: `niri validate`, `systemctl --user status xdg-desktop-portal.service
xdg-desktop-portal-gnome.service xdg-desktop-portal-gtk.service`, and a real
screen-sharing test in the application being used. Healthy service status alone
does not prove an end-to-end capture works.
