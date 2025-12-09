---
cardSpaces: [4, 9, 13, 18, 22, 27, 33, 38, 44, 49, 55, 60, 66, 72, 78, 83, 88, 94]
controls:
  - id: ctrl-mfa-everywhere
    label: Enforce MFA across identities (M1032, M1036)
    delta: 9
  - id: ctrl-app-whitelisting
    label: Application allowlisting blocks unsigned binaries (M1038)
    delta: 7
  - id: ctrl-passwordless
    label: Phishing-resistant auth / WebAuthn rollout (M1032)
    delta: 8
  - id: ctrl-hardening-baseline
    label: Baseline hardening + CIS builds cut attack surface (M1040)
    delta: 6
  - id: ctrl-memory-protections
    label: Exploit mitigation (CFG/ASLR/DEP) enabled fleetwide (M1050)
    delta: 7
  - id: ctrl-network-segmentation
    label: Network segmentation limits lateral movement (M1030)
    delta: 8
  - id: ctrl-zerotrust
    label: Zero-trust checks on east-west and app-to-app (M1030, M1036)
    delta: 8
  - id: ctrl-edr-containment
    label: EDR auto-isolates host after suspicious activity (M1050)
    delta: 10
  - id: ctrl-dns-monitoring
    label: DNS monitoring detects C2 early (M1031)
    delta: 6
  - id: ctrl-waf-virtual-patch
    label: WAF virtual patch shields zero-day (M1043)
    delta: 8
  - id: ctrl-backup-tested
    label: Tested, offline backups ready to restore (M1053)
    delta: 11
  - id: ctrl-email-hardening
    label: DMARC/DKIM/SPF + attachment sandboxing (M1041)
    delta: 7
  - id: ctrl-secrets-rotation
    label: Automated secrets rotation & short-lived tokens (M1032)
    delta: 7
  - id: ctrl-logging-central
    label: Centralized logging + UEBA catches anomalies (M1041)
    delta: 6
  - id: ctrl-asset-inventory
    label: Real-time asset inventory & SBOM coverage (M1018)
    delta: 5
  - id: ctrl-pipeline-signing
    label: Signed builds/artifacts and provenance (M1042)
    delta: 8
  - id: ctrl-tabletop
    label: Tabletop rehearsals sharpened response (M1019)
    delta: 9
  - id: ctrl-sa-deception
    label: Deception/honeytokens trip lateral movement (M1040)
    delta: 7
  - id: ctrl-least-priv
    label: Least-privileged roles and JIT elevation (M1026)
    delta: 7
missteps:
  - id: mis-phish-cred
    label: Phishing led to credential theft (T1566, T1556)
    delta: -8
    tags: [T1566, T1556]
  - id: mis-token-theft
    label: Access token replayed from compromised app (T1528)
    delta: -9
    tags: [T1528]
  - id: mis-rdp-brute
    label: RDP brute-force exposed admin creds (T1110, T1021.001)
    delta: -10
    tags: [T1110, T1021.001]
  - id: mis-shadow-it-tunnel
    label: Shadow tunnel creates backdoor path (T1090)
    delta: -7
    tags: [T1090]
  - id: mis-lateral-psexec
    label: PsExec lateral move across fleet (T1570)
    delta: -9
    tags: [T1570]
  - id: mis-dns-c2
    label: DNS tunneling C2 evades egress filters (T1071.004)
    delta: -8
    tags: [T1071.004]
  - id: mis-backup-wiped
    label: Ransomware wiped reachable backups (T1486)
    delta: -12
    tags: [T1486]
  - id: mis-key-leak
    label: API key leaked in repo (T1552.001)
    delta: -11
    tags: [T1552.001]
  - id: mis-cloud-misconfig
    label: Public S3 bucket leaked data (T1530)
    delta: -10
    tags: [T1530]
  - id: mis-bec
    label: Business email compromise pivoted payments (T1659)
    delta: -10
    tags: [T1659]
  - id: mis-persistence-startup
    label: Malicious startup script persistence (T1037)
    delta: -6
    tags: [T1037]
  - id: mis-supplychain-dep
    label: Compromised dependency pulled into build (T1195)
    delta: -11
    tags: [T1195]
  - id: mis-priv-esc
    label: Kernel exploit escalated to root (T1068)
    delta: -9
    tags: [T1068]
  - id: mis-lolbin-signed
    label: Signed LOLBin abused to evade allowlisting (T1218)
    delta: -7
    tags: [T1218]
  - id: mis-adcs-abuse
    label: AD CS template abuse for persistence (T1649)
    delta: -10
    tags: [T1649]
  - id: mis-browser-inject
    label: Browser credential theft via injection (T1185, T1056.004)
    delta: -8
    tags: [T1185, T1056.004]
  - id: mis-data-stage
    label: Data staged for exfil via cloud sync (T1074, T1567.002)
    delta: -10
    tags: [T1074, T1567.002]
mitigations:
  - id: mit-mfa
    label: MFA + phishing-resistant authenticators (M1032)
    mitigates: [T1566, T1556, T1528]
  - id: mit-password-policy
    label: Credential hygiene & lockout policies (M1027, M1028)
    mitigates: [T1110, T1556]
  - id: mit-network-seg
    label: Network segmentation & ACLs (M1030)
    mitigates: [T1021.001, T1570]
  - id: mit-proxy-ctl
    label: Egress proxy + DNS inspection (M1031, M1040)
    mitigates: [T1071.004, T1090]
  - id: mit-edr-block
    label: EDR prevent/contain lateral tools (M1050)
    mitigates: [T1570, T1037]
  - id: mit-backup-immut
    label: Immutable, isolated backups (M1053)
    mitigates: [T1486]
  - id: mit-secrets-hygiene
    label: Secrets scanning & short-lived creds (M1032)
    mitigates: [T1552.001, T1530]
  - id: mit-cloud-guardrails
    label: Cloud guardrails & IaC policies (M1041)
    mitigates: [T1530, T1195]
  - id: mit-app-allowlist
    label: Application allowlisting (M1038)
    mitigates: [T1037, T1570]
  - id: mit-patch-mgmt
    label: Rapid patching & virtual patching (M1051, M1043)
    mitigates: [T1068, T1090]
  - id: mit-email-hardening
    label: Email auth + sandboxing (M1041)
    mitigates: [T1566, T1659]
  - id: mit-token-binding
    label: Token binding/refresh detection (M1032)
    mitigates: [T1528]
  - id: mit-ad-hardening
    label: Harden/monitor AD CS and templates (M1047)
    mitigates: [T1649]
  - id: mit-lolbin-control
    label: Signed binary control & child process blocking (M1038, M1050)
    mitigates: [T1218, T1056.004]
  - id: mit-browser-isolation
    label: Browser isolation & extension control (M1042)
    mitigates: [T1185, T1056.004]
  - id: mit-dlp-exfil
    label: DLP and exfil monitoring (M1057)
    mitigates: [T1074, T1567.002]
  - id: mit-least-priv
    label: Least privilege & JIT admin (M1026)
    mitigates: [T1068, T1021.001]
---

# Card Library

Edit the YAML above to add, remove, or tweak controls, missteps, mitigations, and the squares that trigger a draw (`cardSpaces`).
- `delta`: Controls are positive (move forward), missteps are negative (move back). Values are clamped so you never go below square 1 or above 100.
- `tags`: Missteps list the ATT&CK techniques they represent; mitigations list techniques they cover. A mitigation choice appears if any tag overlaps.
- `cardSpaces`: Which board squares prompt a draw.
