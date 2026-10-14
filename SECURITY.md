# Security policy

## Security maintainer

[Victor Solano (@vsolano9)](https://github.com/vsolano9) maintains security for
the CLI, package API, and browser inspector in this repository. His project
responsibilities and npm identity are recorded in [MAINTAINERS.md](MAINTAINERS.md).

## Supported versions

Security fixes target the latest stable npm release. The current supported
release is **0.7.0**; older release lines are not separately maintained. An
unreleased change on a Git branch is not an available npm fix. When a confirmed
issue needs a release, the advisory will identify affected and fixed versions.

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/vsolano9/screenproof/security/advisories/new).
Private reporting is enabled for this repository. If you cannot use GitHub,
email **victor@thechosenvictor.com** with the subject `screenproof security report`.
Do not put an unpatched vulnerability or private media in a public issue.

Include the version or commit, the affected entry point, the expected and
observed behavior, the security impact, and a minimal harmless reproduction.
Use synthetic or redacted files; never send credentials or real customer data.
The maintainer aims to acknowledge reports within seven days, then reproduce
and assess them, coordinate a fix and release, and agree on disclosure and
credit with the reporter. This is a best-effort response target.

## Trust boundaries

- The CLI processes files with the permissions of the user who starts it.
  It follows file symlinks and directory junctions to support shared fastlane
  trees. A chosen input root is **not a filesystem sandbox**; inspect links and
  use a restricted process when working with an untrusted tree.
- Config files are trusted inputs: they can disable rules and extend accepted
  dimensions. Review a config before using its result as an upload gate.
- Image and preview checks inspect structural metadata. They do not fully
  decode media, establish that a file is malware-free, or establish App Store
  acceptance. Missing measurements remain explicit in `unverifiedChecks`.
- CLI image reads are limited to a 1 MiB prefix; preview `moov` metadata is
  limited to 64 MiB. The browser reads at most two files concurrently and
  budgets 128 MiB of metadata per selection. These are individual safeguards,
  not an overall memory, CPU, file-count, or elapsed-time guarantee.
- The CLI has no network or credential integration. The browser inspector
  processes selected files locally; loading the site and bundled examples
  involves ordinary network requests. Exported reports contain file paths and
  findings, so review them before sharing.

## Review evidence and limits

The [2026-10-14 security review](docs/security-review-2026-10-14.html) records
the inspected boundaries, observed local checks, and unverified surfaces.
A review or a passing linter result does not certify the software free of
vulnerabilities. Please report reachable security issues through the private
channel above.
