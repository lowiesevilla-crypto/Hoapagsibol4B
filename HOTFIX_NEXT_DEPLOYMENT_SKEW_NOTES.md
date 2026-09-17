# HOAHub Next.js deployment skew hotfix

This hotfix addresses production global error pages that can occur around Server Actions when a browser is still running assets/action identifiers from a previous self-hosted deployment.

The application already stamps every build with `public/release.txt`. The Next.js configuration now reuses that commit-based release identifier as both `deploymentId` and `generateBuildId`, enabling version-skew detection and cache-busting for rolling/self-hosted deployments without changing tenant data or financial logic.

The global recovery classifier also treats known stale Server Action deployment errors as recoverable deployment skew so the browser performs the same safe hard refresh/cache cleanup path already used for stale Next.js chunks.

No schema migration, no tenant data migration, no change to collection accounting, and no change to multi-tenant authorization are included.
