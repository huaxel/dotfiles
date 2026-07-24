## Question

What should the pi health check report look like?

Once we know what data sources are available (from ticket "Health Check Data Sources"), we need to decide:

1. What sections should the terminal report have? (e.g., Cost Summary, Config Drift, Storage Usage, Reliability Issues)
2. What severity levels make sense? (e.g., Critical/Warning/Info or a simpler scheme)
3. What JSON schema should the machine-readable output use?
4. What's the minimal viable report vs a comprehensive one?
5. Should there be a summary score or pass/fail per category?

This is a design conversation — the answer is a spec for the `just pi-healthcheck` output format.
