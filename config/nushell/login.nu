# Nushell login-shell configuration
# Loaded only when nu starts as a login shell (after env.nu and config.nu).
# Per-login setup lives here; per-shell setup belongs in config.nu.

# Report the last login when starting a fresh login shell, unless a session
# file was updated more recently (avoids noise on every terminal spawn).
$env.STARSHIP_LOGIN = "1"
