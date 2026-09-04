# ADR-0016: Minimal Container Base Images and Build Security

* Status: accepted
* Deciders: Security Engineering Guild, DevSecOps Team
* Date: 2024-07-31
Technical Story: PLAT-210
* Category: Container Security
* Depends on: ADR-0004
* Required by: ADR-0029

## Context and Problem Statement

Standard container builds utilized full Linux distributions (Ubuntu, Debian) as base images. Vulnerability scanners consistently reported hundreds of unpatched OS packages, package managers (apt, curl, bash), and shared libraries that had no purpose in production application execution but dramatically expanded attack surfaces for potential container escapes.

## Decision Drivers

* Radical reduction of container Common Vulnerabilities and Exposures (CVE) count
* Removal of package managers, shells, and debugging binaries from production containers
* Enforce non-root execution and immutable root filesystems by default

## Considered Options

* Option 1: Distroless / Chainguard Minimal Base Images with Multi-Stage Builds
* Option 2: Full Linux Distribution Base Images with Automated Patching

## Decision Outcome

Chosen option: "Distroless / Chainguard Minimal Base Images with Multi-Stage Builds", because Depends on ADR-0004. Defense-in-depth requires eliminating extraneous system binaries from production runtimes. Stripped distroless images deliver auditable, minimal attack surfaces.

### Positive Consequences

* Security scanner CVE alerts dropped from an average of 140 per image to less than 3.
* Node pull latency decreased by 60%, drastically accelerating pod autoscaling response.
* Satisfies compliance requirements for non-root execution and read-only root filesystems.

### Negative Consequences

* Engineers must learn to use kubectl debug ephemeral containers when diagnosing production container issues.
* Native C library dependencies require explicit staging during multi-stage image builds.

## Pros and Cons of the Options

### Option 1: Distroless / Chainguard Minimal Base Images with Multi-Stage Builds

Compile binaries in builder stages, copying only the compiled application and minimal glibc/musl runtimes into stripped distroless images running as unprivileged UID 65532.

* Good, because Reduces container vulnerability footprint by over 95%
* Good, because Attackers gaining remote code execution have no shell or package manager to download payloads
* Good, because Smaller image footprint (under 50MB) accelerates node pull times
* Bad, because Requires ephemeral debug containers for interactive production troubleshooting
* Bad, because Requires multi-stage build discipline across all Dockerfiles

### Option 2: Full Linux Distribution Base Images with Automated Patching

Continue using Debian-slim base images, running nightly apt upgrade scripts.

* Good, because Familiar debugging tools available inside container shells
* Bad, because Continuous churn in image layers requiring constant rebuilds
* Bad, because Retains high CVE counts in non-essential system utilities

## Links and Primary Sources

### Internal Platform Links
* [ADR-0004: Immutable Digest Container Promotion Lifecycle](0004-immutable-digest-container-promotion.md)
* [ADR-0029: Admission Control Policy-as-Code with Gatekeeper](0029-admission-control-policy-as-code.md)

### Canonical Primary Sources
* [GoogleContainerTools: Distroless Images](https://github.com/GoogleContainerTools/distroless)

