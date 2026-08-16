# HOAHub Agent Context

Last updated: 2026-08-16

## Purpose

This file is the repository-level operating context for AI coding agents and maintainers working on HOAHub. Treat production safety, tenant isolation, authentication integrity, mobile/PWA usability, auditable deployment, and repository-context maintenance as release gates rather than optional improvements.

## Mandatory Agent.md Maintenance

`Agent.md` must be reviewed and updated for **every change** made to the repository before that change is merged or deployed.

This requirement applies to feature work, bug fixes, refactors, UX/UI changes, tests, CI/CD changes, deployment changes, security changes, database changes, integrations, mobile/PWA changes, documentation-affecting behavior, and operational fixes.

For every branch/PR/change:

1. Read `Agent.md` before implementation.
2. Update the relevant section(s) to reflect the new behavior, constraints, files, architecture, deployment assumptions, tests, or rollback information.
3. If the change does not alter an existing section, add a concise entry or clarification so the repository context still records the change.
4. Keep `Last updated` current.
5. Do not merge or deploy a repository change that leaves `Agent.md` stale.
6. Never place credentials, secret values, access tokens, database passwords, private keys, or other sensitive production values in `Agent.md`.

A missing `Agent.md` update is considered an incomplete change.

## Product and Architecture Baseline

- HOAHub is a multi-tenant community/homeowners-association SaaS platform.
- Primary application stack: Next.js, React, TypeScript, Tailwind CSS, Prisma, and MySQL.
- Production hosting is Hostinger.
- Tenant-owned data must remain tenant-scoped at every UI, API, service, job, storage, cache, export, and AI boundary.
- Server-side authenticated session context is authoritative. Never trust a browser-supplied tenant identifier, role, account owner, or redirect destination as proof of authorization.

## Non-Negotiable Security Rules

1. Preserve tenant isolation and fail closed when tenant/user authority is ambiguous.
2. Preserve RBAC/permission checks and record-ownership checks on server-side actions.
3. Do not weaken `safeReturnTo`, session validation, passkey verification, or authentication redirect controls.
4. Never commit production secrets, API keys, passwords, private certificates, or Hostinger credentials.
5. Do not expose raw database access to client code or AI/model surfaces.
6. State-changing operations must continue to use server-side business validation and audit controls.
7. Security-sensitive behavior must remain covered by automated tests when implementation details change.

## Homeowner Mobile and PWA Requirements

Homeowner-facing changes must be designed for installed PWA and mobile-browser use, not desktop only.

- Use dynamic viewport behavior (`100dvh`) where full-height layouts are required.
- Respect `env(safe-area-inset-top/right/bottom/left)` for notches and home indicators.
- Support standalone display mode where applicable.
- Keep primary touch controls at least 48px high where practical.
- Avoid desktop-only hover as the sole interaction cue.
- Avoid expensive decorative animation on mobile; keep motion lightweight and non-blocking.
- Honor `prefers-reduced-motion`.
- Ensure critical cards/forms can scroll safely on short mobile viewports without horizontal overflow.
- Preserve passkey support on compatible mobile devices.
- The root application layout owns the single `PwaInstallProvider` so installability detection, service-worker registration, offline state, and update handling are available from the public `hoahub.tech` entry as well as authenticated homeowner routes. Do not reintroduce a second provider in `app/portal/layout.tsx`.
- When a homeowner opens the public HOAHub entry in a mobile browser and the current browsing context is not standalone/installed, `PublicPwaInstallBanner` may prompt the user to install. Chromium uses the captured `beforeinstallprompt` event and invokes `.prompt()` only from an explicit user action; iOS uses Share -> Add to Home Screen instructions. `appinstalled` and standalone checks suppress the install UI after installation, and dismissal metadata uses only generic local-storage cooldown state.
- Installed-state detection is necessarily browser-scoped: use `(display-mode: standalone)`, iOS `navigator.standalone`, `appinstalled`, and the browser installability event. A normal browser tab cannot reliably discover every separately installed PWA instance on the device, so never claim universal device-level detection.
- On `/portal/pay`, the long `Unpaid Billings`, `Payment Status`, `PayMongo Online` guidance, `Pay securely online` guidance, and `Online payment fee disclosure` surfaces are accessible disclosure controls and default to collapsed so homeowner phones do not require excessive vertical scrolling. Keep a clear expand/collapse chevron and keyboard-visible focus treatment on every trigger.
- Keep the primary payment task visible without expanding guidance: `Transaction type` and `Billing items` remain outside the collapsed `Pay securely online` disclosure and receive stronger visual priority. The collapsed `PayMongo Online` summary continues to show the tenant payment account, association name, and payment mode.
- The collapsed online-fee disclosure must continue to show the `HOAHub convenience fee` amount. Keep navigation actions such as `View billing` and `History` inside the expanded content rather than nesting interactive links inside a disclosure trigger.

## Current Release: Community Pulse Premium Login

Community Pulse is the premium HOAHub login experience introduced through PR #103 and strengthened through subsequent mobile/PWA, web, verification, and post-login handoff work.

### Current Login Motion

- Desktop/web uses staged branding, animated grid/pulse layers, aurora glows, light sweeps, feature-card sheen, focused-field illumination, button sheen, passkey micro-motion, and a clearly visible blue/green secure orbit around the stable tenant/HOA logo.
- Mobile/PWA uses a clearly visible community mesh, moving blue/green signal wave, traveling nodes, animated logo orbit/halo, signal rail, animated card beam, ambient glows, and touch-safe form motion.
- The HOAHub/tenant logo itself remains visually stable during idle login on both desktop/web and mobile/PWA; only the surrounding orbit/halo rotates so brand legibility is preserved.
- Desktop/web and mobile/PWA use the same authentication-state language: idle secure orbit, `Verifying access…`, branded `Access verified`, then authenticated-shell handoff.
- All non-essential motion must honor `prefers-reduced-motion`.

### Login Verification Transition

The current release adds an explicit authentication-state sequence without replacing the existing authentication logic:

1. Idle: stable HOAHub/tenant logo with a rotating secure orbit and visible Community Pulse motion on desktop/web and mobile/PWA.
2. Pending credential authentication: the primary button displays `Verifying access…` with a restrained spinner while the existing server action is pending.
3. Successful credential authentication: the form transitions out and a dedicated success state shows the branded logo, one completing blue/green orbit, green confirmation badge, `Access verified`, and `Opening your HOAHub dashboard…`.
4. Redirect: navigation occurs after an approximately 800 ms visible confirmation window using the existing safe redirect target (`returnTo` first, otherwise the authenticated `redirectTo`).
5. Authenticated-shell handoff: the first shared HOA/tenant logo rendered after successful login receives one short blue/green orbit and confirmation pulse, then returns to a fully static logo.

The success animation must never be shown before the existing server authentication action returns a valid redirect target.

### Multi-Account Login Selection

A user whose already-verified credentials match more than one active HOA/tenant account must authenticate **once** and then choose the isolated account/session to open.

- The first credential submission performs the normal server-side password verification and builds only the authorized account choices.
- When multiple choices exist, the server writes a short-lived signed `hoa_login_choice` cookie. It is `HttpOnly`, `SameSite=Lax`, secure in production, expires after approximately five minutes, contains only the allowed user IDs plus a purpose marker, and is signed with the same protected server secret boundary as authentication.
- A verified choice handoff is created only for a non-empty multi-account choice set; optional/undefined choice state must never be treated as an authenticated selection proof.
- If an authentication resolver ever produces a choice-bearing result with an empty or missing choice array, the login must fail closed with no session creation; it must never fall through to the normal authenticated-session path.
- The account-selection UI removes the username/email and password fields after identity verification. The second submission sends only `selectedUserId` plus normal navigation context; the password is never retained in React state, hidden inputs, session storage, local storage, or the choice cookie.
- The server accepts a selected account only when its user ID is present in the valid signed choice cookie, then revalidates the selected user and tenant as active before creating the tenant-scoped session.
- Login finalization occurs before an authenticated tenant session exists, so it must not depend on request-local tenant-scoped Prisma context. After server revalidation, prepare the session and atomically persist `lastLoginAt`, the tenant audit entry, and `UserSession` through the platform client using explicit selected `userId`/`tenantId` predicates; issue the signed browser session cookie only after that transaction succeeds.
- If session-cookie issuance fails after the database transaction, revoke the just-created session row. Account-selection finalization errors must be contained as a normal sign-in error rather than surfacing a generic server-side exception page.
- The temporary choice cookie is cleared only after a successful selected-account session handoff, when a new credential login starts, on expiry/error, and during logout flows.
- A missing, expired, tampered, or mismatched choice cookie fails closed and requires a fresh sign-in.
- Tenant isolation remains mandatory: choosing one account loads only that tenant/account into the authenticated session.
- Both `tests/unit/login-multi-account-selection.test.ts` and the existing `tests/unit/homeowner-multi-account-surface.test.ts` must assert the credential-free second step and tenant/account-isolated session behavior; stale tests must not require the former credential-resubmission UI.

### Post-Login Brand Handoff

A short-lived browser session marker (`hoahub.login.handoff.v1`) is written only after successful credential or passkey authentication.

- The marker contains only a local timestamp; it contains no identity, tenant, session, credential, or authorization data.
- `AssociationLogo` uses the shared `PostLoginBrandOrbit` wrapper so the handoff applies consistently across authenticated homeowner, admin, desktop/web, and mobile/PWA shells without duplicating layout logic.
- Login, forgot-password, and reset-password routes explicitly do not consume or display the post-login handoff orbit.
- The marker is accepted only for approximately 10 seconds after successful authentication.
- The authenticated-logo handoff is visible for approximately 1.7 seconds, performs one rotation/pulse sequence, removes the marker, and does not continuously animate during normal navigation.
- If browser session storage is blocked or unavailable, authentication and navigation must continue normally; the animation is optional presentation only.
- `prefers-reduced-motion` removes the rotating/pulsing motion while preserving a minimal confirmation state.

### Community Pulse Files

- `components/tenant-login-screen.tsx`
- `components/login-form.tsx`
- `components/passkey-login-button.tsx`
- `components/association-logo.tsx`
- `components/post-login-brand-orbit.tsx`
- `components/post-login-brand-orbit.module.css`
- `components/community-pulse-login.module.css`
- `components/community-pulse-mobile-premium.module.css`
- `components/community-pulse-web-premium.module.css`
- `components/login-verified-transition.module.css`
- `lib/login-choice-cookie.ts`
- `tests/unit/community-pulse-login-transition.test.ts`
- `tests/unit/login-multi-account-selection.test.ts`
- `tests/unit/homeowner-multi-account-surface.test.ts`

### Client/Server Branding Boundary

- `lib/tenant-logo.ts` is a server-side logo upload/storage utility and imports Node-only APIs including `node:crypto`, `node:fs/promises`, and `node:path`.
- Client components such as `components/login-form.tsx` must never import `lib/tenant-logo.ts`, even only to reuse `DEFAULT_TENANT_LOGO_URL`, because doing so pulls Node-only modules into the browser bundle and breaks the production build.
- `TenantLoginScreen` resolves the tenant/default logo on the server and passes the resolved URL into client presentation components.
- When a client-only defensive fallback is still required, use the static public path `/Hoahub-logo.png` locally rather than importing the server utility.
- `tests/unit/community-pulse-login-transition.test.ts` enforces this boundary.

### Authentication Boundary

Community Pulse is a presentation/interaction enhancement. It must not bypass or replace the existing authentication action, server-side session validation, tenant/account selection, safe redirect handling, homeowner account selection, or passkey verification.

The post-login animation marker is never authoritative authentication state. Authenticated server/session checks remain the only authority for protected routes.

The homeowner identifier remains compatible with either verified email or the 11-digit homeowner account number.

## Resident Messaging Privacy and Message Requests

The homeowner `/portal/chat` experience supports tenant-scoped resident-to-resident messaging in addition to verified HOA personnel, with server-enforced privacy, Message Requests, block/unblock controls, and a phone-first Messenger-style interaction model.

- Homeowners may discover other active `HOMEOWNER` users only inside the same authenticated tenant. The client payload deliberately blanks email and omits email from homeowner recipient search text; private resident email/phone must never be exposed as directory metadata.
- Homeowner discovery supports **name, block, lot, and block+lot search**, but a resident's full/street/property address must never be returned to the homeowner browser, rendered in search results, conversation rows, message headers, privacy controls, or embedded in homeowner chat `searchText`. Block and lot are lookup keys only; normal resident rows identify the person by name/avatar/Resident status rather than exposing the property address.
- `lib/services/homeowner-chat-view.ts` is the homeowner-facing payload boundary. Initial page data, chat refreshes, conversation mutations, and message mutations must pass through `sanitizeHomeownerChatPayload` before being returned to a `HOMEOWNER`; structured `homeownerProfile` and resident email are removed while a derived name/block/lot search string preserves approved lookup behavior.
- The sanitizer's TypeScript return shape must mirror the browser-safe payload: homeowner-facing user nodes expose `homeownerProfile: null`, blank resident email, safe avatar URL, and derived search text. Do not fix type errors by widening the homeowner client type to accept the original structured property profile or address-bearing shape.
- `/api/chat/homeowners` is tenant-scoped, active-homeowner-only, excludes the current user, and selects only the minimum directory fields needed for name/block/lot discovery. Do not add address, phone, email, or other property/contact fields to that response.
- The homeowner phone/PWA `/portal/chat` UI follows Messenger-like density and interaction hierarchy rather than the generic HOA workspace layout: compact inbox/search, resident conversation rows, a compact full-height active thread, left/right message bubbles, overflow-menu secondary actions, and a compact bottom composer. Decorative or instructional hero content must not dominate the messaging task.
- Every homeowner messaging/privacy surface is a viewport-fit release gate. Containers, grids, rows, summaries, inputs, request cards, and block/unblock controls must use shrink-safe `min-w-0`/`max-w-full` patterns and must not create horizontal scrolling or clip actions on supported phone widths.
- A homeowner's `residentMessagingMode` is one of `INBOX`, `REQUESTS`, or `NONE`. The default is `REQUESTS`. `INBOX` admits a new resident conversation directly, `REQUESTS` creates a pending request that remains outside the recipient's normal Chats until accepted, and `NONE` prevents another resident from starting a new resident chat.
- Incoming pending/declined request conversations are excluded from the normal chat payload for the recipient. `HomeownerChatPrivacyPanel` exposes pending requests with explicit Accept/Decline actions. Accepting reveals the existing conversation; declining permanently stops sends on that request unless a future product change explicitly defines a re-request lifecycle.
- A block is tenant-scoped and resident-only. If either resident has blocked the other, direct resident conversation creation and every resident-to-resident send fail server-side. Unblock removes only the current user's block record.
- `HOA Official` status is derived only from authenticated server roles (`ADMIN`, `SYSTEM_ADMIN`, `EMPLOYEE`). The browser never supplies or upgrades official authority. Resident privacy and block records apply only when both participants are residents, so a resident cannot suppress or impersonate verified HOA official communication through these controls.
- `createChatMessage` rechecks block and request state on every resident-to-resident send; the request recipient cannot reply while a request is pending and no participant can send after decline. Never rely on disabled client controls as the enforcement boundary.
- Persistence is provided by migration `20260815213000_chat_privacy_requests_blocks`, which creates tenant-scoped `ChatPrivacyPreference`, `ChatUserBlock`, and `ChatMessageRequest` tables. The current service accesses these narrowly through parameterized Prisma raw SQL until the domain is promoted into generated Prisma models.
- The homeowner UI uses the dedicated `components/homeowner-messenger.tsx`; admin and employee messaging may continue to use the generic `components/chat-messenger.tsx`. Do not regress homeowner chat back to the generic workspace component.
- Homeowner avatars may be shown in Messenger using `/api/profile/photo/[userId]`. That image route must authenticate the viewer, require the target to be an active homeowner in the same tenant, derive the tenant storage directory from the authenticated viewer context, and fall back to initials if no photo exists. The avatar route must never expose raw upload paths or weaken the address/contact privacy boundary.
- Core implementation: `lib/services/chat.ts`, `lib/services/chat-privacy.ts`, `lib/services/homeowner-chat-view.ts`, `components/homeowner-messenger.tsx`, `components/homeowner-chat-privacy-panel.tsx`, `components/homeowner-avatar.tsx`, `app/api/chat/homeowners/route.ts`, `app/api/chat/privacy/route.ts`, `app/api/chat/requests/route.ts`, `app/api/chat/blocks/route.ts`, `app/api/profile/photo/[userId]/route.ts`, and `app/portal/chat/page.tsx`.
- Regression coverage: `tests/unit/homeowner-chat-privacy-pwa-install.test.ts`, `tests/unit/homeowner-messenger-ui.test.ts`, `tests/unit/homeowner-chat-mobile-privacy-layout.test.ts`, and `tests/unit/homeowner-premium-ui.test.ts`, plus the homeowner PWA verifier's narrow changed-file allow-list for approved chat changes.
- Do not merge/deploy a messaging change when homeowner directory population, name/block/lot search, address non-disclosure, phone viewport fit, message-request/block enforcement, or the Messenger-style mobile thread fails its acceptance checks. A visually incomplete desktop-card/form presentation is not an acceptable substitute for the approved phone chat experience.

## Homeowner Profile UI and Photo Upload

The homeowner `/portal/profile` surface is a mobile-first identity screen, not a long administrative record form.

- Keep the primary profile card compact: profile photo, homeowner name, block/lot, account number, current homeowner status, and monthly dues are the first-screen hierarchy. Do not restore the large instructional `PageHeader`, oversized `InfoTile` grid, or verbose tenant-isolation explanations on this homeowner screen.
- Contact information uses compact rows. `Home & household` and `Security` are disclosure sections so detailed property, household, and passkey information does not dominate the phone viewport. The linked HOA account switcher is rendered only when more than one linked account exists.
- Homeowners may upload, replace, or remove their own profile photo. Accepted formats are JPEG, PNG, and WebP with a 5 MB maximum. Client MIME checks are convenience only; `app/api/profile/photo/route.ts` must also validate the file signature before persistence.
- Profile photo reads/writes require an authenticated `HOMEOWNER` session. Photo metadata is keyed by both `tenantId` and `userId`, and the storage directory is derived from the authenticated tenant slug and authenticated user ID. Never accept tenant IDs, tenant slugs, user IDs, storage paths, or stored filenames from the browser as authority.
- Profile image bytes are served through the authenticated `/api/profile/photo` route instead of a public upload URL. Use `X-Content-Type-Options: nosniff` and private caching; do not expose the underlying tenant storage path to the browser.
- Migration `20260816090000_homeowner_profile_photo` creates `HomeownerProfilePhoto`. The table is intentionally separate from core `User`/`HomeownerProfile` records so photo storage can evolve or roll back without modifying authentication or homeowner master-data fields.
- Photo upload/removal is audit logged. A successful replacement removes the previous stored file after the new metadata is committed; a failed metadata write removes the newly written file so orphaning is bounded.
- The current homeowner photo is also a shared identity surface. `components/homeowner-avatar.tsx` is the resilient photo/initials placeholder used by the homeowner mobile header and dedicated Messenger UI; modules must prefer that shared component instead of duplicating broken-image behavior.
- Core implementation: `app/portal/profile/page.tsx`, `components/homeowner/profile-photo-uploader.tsx`, `components/homeowner-avatar.tsx`, `app/api/profile/photo/route.ts`, `app/api/profile/photo/[userId]/route.ts`, and `lib/services/homeowner-profile-photo.ts`.
- Regression coverage: `tests/unit/homeowner-profile-clean-ui.test.ts`, `tests/unit/homeowner-profile-photo-api.test.ts`, and `tests/unit/homeowner-premium-ui.test.ts`.
- Do not merge/deploy a profile change if the mobile profile returns to oversized cards/wordy guidance, if an image endpoint can cross tenant/user boundaries, or if unsupported/spoofed image types can be persisted.

## Homeowner Premium UI System

The homeowner portal is a phone-first consumer experience. Premium means restrained hierarchy, fast scanning, consistent iconography, compact state, and minimal explanatory copy—not adding decorative cards for every field.

- Use the existing Lucide icon system for functional navigation, states, payments, requests, community actions, and empty states. Do not introduce generated decorative imagery merely to replace a standard product icon; generated artwork is appropriate only when it adds real content value and does not reduce clarity or load performance.
- Prefer icon-led rows, tabs, chips, compact summaries, and disclosure panels over large stacked cards. Reserve large cards for a single primary financial/state task, an actionable alert, or rich media that genuinely needs space.
- Remove duplicate headings, repeated status explanations, marketing-style notes, and paragraphs that restate labels already visible in the UI. Put secondary guidance behind a disclosure when it must remain available.
- `components/portal-mobile-shell.tsx` owns the compact homeowner mobile header, bottom navigation, summary cards, action tiles, and shared list/empty/error patterns. Changes to Payment, Requests, Community, Profile, and Messaging should reuse these patterns before creating one-off containers.
- The homeowner mobile header shows the authenticated homeowner photo through `/api/profile/photo` with initials fallback. This provides identity continuity across Payment, Requests, Community, and other portal modules without repeating a profile card on every screen.
- Payment UI keeps the balance and primary `Pay` action dominant, keeps transaction/billing inputs immediately usable, retains required collapsed PayMongo/fee disclosures, and represents secondary Statement/History/Receipts actions as compact icon actions. Do not re-expand redundant metric descriptions into large cards.
- Requests UI uses a four-icon area switcher, compact open/document/complaint counts, only the two meaningful create actions (`Document request`, `Submit complaint`), and compact status/progress cards. Gate Pass and Move-In/Move-Out remain document types inside the document workflow rather than duplicate landing-page cards.
- Community UI uses compact Notices/Events/Officers summaries and direct action rows for Announcements, Events, Messages, and HOA Officers. Avoid a second navigation grid that duplicates the same destinations and avoid notes such as `Tenant-scoped` or `Published HOA roster` when they do not help the homeowner complete a task.
- The community mobile release verifier must assert the semantic contract—`AnnouncementMobileCard`, `EventMobileCard`, and `VehicleMobileCard` are actually used by their homeowner routes and compressed desktop `<table>` layouts are absent—without pinning the premium design to decorative radius or grid-gap tokens that may legitimately become more compact.
- Homeowner Messenger uses actual same-tenant homeowner profile photos when available and initials placeholders otherwise. Search still supports name/block/lot, while normal rows show identity/status only and never expose addresses.
- Premium homeowner surfaces must remain viewport-safe at narrow phone widths, use `min-w-0` where content can shrink, avoid horizontal scrolling for primary controls, honor safe-area insets, and keep primary touch targets at least approximately 48px.
- The fixed homeowner bottom navigation keeps `min-h-14` on every destination and preserves `env(safe-area-inset-bottom)` plus keyboard-visible focus treatment. Do not shrink the destination touch target below this verified release-gate token merely to make the premium shell look denser.
- Core implementation: `components/portal-mobile-shell.tsx`, `components/homeowner-avatar.tsx`, `components/homeowner/payments/payment-cards.tsx`, `components/homeowner/requests/request-cards.tsx`, `components/homeowner/community/community-cards.tsx`, `components/homeowner-messenger.tsx`, `app/portal/pay/page.tsx`, `app/portal/requests/page.tsx`, `app/portal/community/page.tsx`, and `app/portal/chat/page.tsx`.
- Regression coverage: `tests/unit/homeowner-premium-ui.test.ts` plus the existing payment, request, community, messaging, profile, and PWA tests.
- Do not merge/deploy a homeowner UI change merely because desktop screenshots look acceptable. The mobile/PWA interaction hierarchy, touch targets, tenant/privacy boundaries, and browser E2E gates are part of the release acceptance contract.

## Homeowner Statement of Account UI and Print

The homeowner `/portal/soa` surface is a compact account screen with a separate print representation. The screen must optimize for phone/PWA scanning while `Print SOA` must always produce the complete statement, independent of which screen disclosures are open.

- Keep the visible hierarchy compact: payment-area navigation, `My account` / `Statement of Account`, statement code, one primary outstanding-balance summary, and concise credit/net-balance/last-payment facts. Do not restore the previous four large summary cards or explanatory download note.
- `Receivables aging`, `Running ledger`, `Payment history`, and `Billing history` are accessible native disclosure sections and default to collapsed. Each trigger uses a clear chevron and keyboard-visible focus treatment. Secondary links such as `Receipts` and `View bills` belong inside expanded content rather than inside the disclosure trigger.
- `SoaPrintButton` continues to invoke the browser print dialog, but the printable DOM is `HomeownerSoaPrintDocument`, not the collapsed screen cards. The print document is rendered from the same server-loaded `getStatementOfAccount(profile.id, profile.tenantId, ...)` result, so disclosure state can never remove rows from the printed statement.
- The homeowner print must include association identity/contact details, statement code/date, homeowner name/account/block/lot/property address/contact/email/monthly dues/status, outstanding/credit/net balance, total billed/payments/credits/penalties, last-payment and collection status, all receivable-aging buckets, the complete running ledger, complete payment history including receipt/method/reference/coverage/received/applied/credit/status/collector, complete billing history, and the authorization/signature footer.
- Printing the homeowner's own property/contact details is permitted because the page is protected by `requireHomeownerProfile` and the statement query is scoped by the authenticated `profile.id` and `profile.tenantId`. Never accept browser-supplied tenant or homeowner identity to generate this print output, and never expose another resident's private data through it.
- Do not reuse `soa.verifyUrl` in the homeowner print while it resolves to the admin-only SOA route. A future homeowner QR/verification feature must first define a homeowner-authorized or public verification boundary rather than sending homeowners to an admin URL.
- The hidden `.homeowner-soa-print` marker exists only so global print CSS can suppress the portal shell. Keep the actual printable statement outside that marker so the richer `.soa-document` pagination/table rules control multi-page output rather than the older screen-card print rules.
- Core implementation: `app/portal/soa/page.tsx`, `components/homeowner/payments/homeowner-soa-print-document.tsx`, and `components/soa-print-button.tsx`.
- Regression coverage: `tests/unit/homeowner-soa-clean-print.test.ts` plus `scripts/verify-homeowner-mobile-payments.ts` and the critical browser homeowner SOA path.
- Do not merge/deploy this surface if any of the four detail areas cannot collapse cleanly on phones, if Print SOA prints only the currently visible/collapsed subset, if full ledger/payment/billing rows are omitted from the print document, or if tenant/homeowner authority is moved into browser-controlled input.

## Homeowner Payment Status Authority

Homeowner-facing payment status must describe the current financial state, not allow an older failed attempt to override a later successful payment.

- The Statement of Account posted balance is authoritative for the homeowner's **current balance status**. If billing exists and `currentOutstandingBalance <= 0`, the current status is `Fully Paid` even when an older request was rejected, cancelled, or was previously pending.
- Historical rejected/cancelled attempts remain valid audit/history records; they must not be promoted into the current balance headline after the account is settled.
- When a balance remains outstanding, the latest relevant pending/rejected request may still be shown as `Payment Pending` or `Payment Rejected`.
- PayMongo requests are gateway-controlled. Manual approval/rejection remains prohibited while awaiting gateway confirmation. A payment is posted only through verified PayMongo webhook processing and the normal transactional ledger/receipt path.
- The PayMongo webhook is allowed to recover a request that was previously marked rejected by checkout cancellation when a later verified paid event for that same checkout arrives; it resets the request to a processable state and approves/posts it transactionally.
- A posted `Payment` or `Collection` linked to a request is stronger evidence of settlement than stale request-display metadata. UI changes must prefer posted ledger artifacts and the resulting SOA balance when describing current payment state.
- Every homeowner `Payment Status` card must resolve its displayed label/tone using the linked posted ledger artifacts (`request.payment` or `request.collection`) before stale request metadata. In particular, a PayMongo request with a linked posted artifact must display `Paid · PayMongo confirmed` even if an earlier request status remains `REJECTED` or `CANCELLED` in history.
- Do not call the PayMongo API merely to render each homeowner payment page. The authoritative local posted ledger is created only from verified PayMongo webhook processing; page rendering reads that tenant-scoped local financial state.
- Payment status corrections must never create a receipt merely from a browser redirect/query parameter. Only verified gateway confirmation or the existing authorized manual accounting workflow can post financial records.
- Core implementation: `lib/services/homeowner-payment-status.ts`, `app/portal/pay/page.tsx`, `lib/services/homeowner-paymongo.ts`, and `lib/services/payment-requests.ts`.
- Regression coverage: `tests/unit/homeowner-payment-status.test.ts`, including source-level wiring that ensures the homeowner page passes linked `Payment`/`Collection` evidence into the status resolver and keeps the long homeowner payment sections/disclosure controls collapsible while payment inputs remain immediately usable.

## Validation Gate

Before production deployment, the applicable CI pipeline must pass. The repository production workflow currently covers:

- `pnpm install --frozen-lockfile`
- `pnpm lint`
- `pnpm exec prisma validate`
- `pnpm exec prisma generate`
- `pnpm exec prisma migrate deploy` against the CI database
- `pnpm db:seed`
- `pnpm test`
- `pnpm test:integration`
- `pnpm test:critical`
- `pnpm typecheck`
- `pnpm build`
- production smoke tests and critical browser/E2E tests

Do not merge a known failing release merely to trigger deployment. Fix the defect or update a brittle test only when the changed test continues to assert the intended security/business invariant.

### CI Browser Gate Recovery

The production rollback to the PR #109 application tree intentionally removed PR #110 as a whole. The browser gate still needs a narrow, test-only reliability contract without restoring PR #110's production-login verifier or application behavior.

- GitHub Actions prepares the repository-provided `@sparticuz/chromium` executable and exposes it only to the browser suites through `PUPPETEER_EXECUTABLE_PATH`.
- `tests/e2e/critical-path.mjs` launches that packaged browser as `headless: "shell"` with Puppeteer's default arguments merged with `chromium.args`; this matches the chrome-headless-shell runtime contract.
- `tests/e2e/safe-browser-context-cleanup.mjs` must not create non-default BrowserContexts on this runtime. Each logical isolated test context launches a separate browser process and uses that process's default context, preserving cookie/session isolation without the unstable `Target.createTarget` path.
- Every standalone E2E entry point in `test:e2e` preloads the same isolation shim; the critical path already does so through `run-critical-path.mjs`.
- Cleanup remains bounded and may force-kill only browser processes that fail to close; it must never relax business assertion/navigation timeouts.
- The bounded retry in `run-critical-path.mjs` remains limited to the specific transient startup signature `Target.setDiscoverTargets` + `Target closed`; business assertion failures are never retried automatically.
- The document workflow E2E must wait for the client-generated `submissionKey` and an enabled submit control before clicking. After the click it must surface the form's `status`/`alert` response before polling the database, so a real validation failure is reported directly instead of being misclassified as a generic database timeout.
- This recovery deliberately does **not** restore PR #110's authenticated production-login verifier and does not change the Hostinger deployment activation path.
- This recovery also does **not** change the existing application dependency versions in `package.json`; any future browser dependency alignment must first prove that it cannot alter production document/browser runtime behavior.
- Regression coverage: `tests/unit/browser-cleanup-policy.test.ts`.

## Hostinger Production Deployment Model

The live HOAHub application is a Hostinger managed Node.js web application connected to the GitHub `main` branch. Hostinger's managed GitHub deployment is the normal production activation path.

- Production feature branches are not deployment targets.
- Production changes must land on `main` through the approved GitHub flow.
- A push/merge to `main` runs the HOAHub verification workflow and triggers Hostinger's connected-GitHub auto-deployment.
- GitHub CI must not claim a release is live merely because CI passed or because files were copied through SSH.
- `scripts/write-release-id.mjs` stamps the build's short Git commit SHA into `public/release.txt`.
- The production verification job waits until `${HOSTINGER_APP_URL}/release.txt` matches the expected `main` commit SHA, then checks `${HOSTINGER_APP_URL}/api/health`.
- A release is considered deployed only after the expected release marker and public health check both pass.
- Do not rely on a global `pm2` executable for the normal Hostinger managed-web-app deployment path; Hostinger manages the application process lifecycle for the connected web app.
- Hostinger's install layer can invoke pnpm while the managed application build subprocess does not necessarily expose the `pnpm` executable in `PATH`. Production build scripts therefore must not shell out to a nested `pnpm` command. Invoke Node scripts and installed package binaries directly from the lifecycle command instead.
- `tests/unit/hostinger-build-script.test.ts` protects this Hostinger build-PATH invariant.

### Hostinger Runtime and Filesystem

- Hostinger production is configured for Node.js 22.x.
- The confirmed Node 22 binary directory exposed on the account is `/opt/alt/alt-nodejs22/root/usr/bin`.
- Non-interactive SSH sessions may not automatically include that runtime in `PATH`; legacy/diagnostic SSH scripts must source `scripts/hostinger-runtime.sh` before invoking Node-based tooling.
- `HOSTINGER_APP_PATH`, when used by legacy/diagnostic SSH tooling, is the application root `/home/u309242896/domains/hoahub.tech`, not the `storage` directory or `.env` file.
- The persistent server-side environment file created for SSH tooling is `$HOSTINGER_APP_PATH/shared/.env`.
- Never expose, print, commit, or copy the contents of the production `.env` into CI logs or repository files.
- The older immutable-release/PM2 SSH activation script is not the authoritative production activation path for the Hostinger managed web app. Do not report its PM2 failure as evidence that the Hostinger GitHub-connected deployment failed.

## Release Identification

`package.json` invokes `node scripts/write-release-id.mjs` directly before both the normal Next.js build and `hostinger:build`. Do not replace this with a nested `pnpm release:stamp` call in managed Hostinger build commands, because pnpm may be unavailable inside the build subprocess even though Hostinger used pnpm for dependency installation. The stamp script writes a short Git revision to `public/release.txt`.

Production verification should compare that public marker with the expected `main` commit before asserting that a UI fix or feature is live. This avoids confusing an older healthy production build with the newly merged release.

## Community Pulse Rollback

Community Pulse, the verified-login transition, the multi-account verified-choice cookie, and the post-login brand handoff introduce no dedicated database migration.

If the login UX causes a production regression:

- revert the relevant login/authentication merge commit on `main`;
- allow Hostinger's managed GitHub deployment to publish the reverted commit;
- confirm `/release.txt` matches the rollback commit;
- confirm `/api/health` succeeds;
- re-test credential login, multi-account selection without password re-entry, passkey login, tenant/account isolation, safe return navigation, authenticated logo handoff, and homeowner mobile/PWA login.

Authentication/session data should not require a database rollback for these interaction-layer changes.

## Change Discipline

For every repository change—not only security-sensitive changes:

- Read the existing implementation, tests, and relevant security boundaries first.
- Keep tenant/user authority server-controlled.
- Add or update regression tests for the intended invariant when behavior changes.
- Keep desktop and homeowner PWA/mobile behavior in the acceptance criteria when user-facing behavior is affected.
- Keep production deployment verification aligned with the actual Hostinger hosting model.
- Update `Agent.md` in the same branch/PR before merge and deployment.