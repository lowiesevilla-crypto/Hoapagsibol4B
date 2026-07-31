# Complaint Management UAT Plan

Run against local database only: `127.0.0.1 / hoahub_prodclone_local`.

1. Enable `COMPLAINTS` for a pilot tenant in module entitlements.
2. Log in as an activated homeowner.
3. Open `/portal/complaints`; confirm navigation and mobile bottom navigation remain usable.
4. Submit a named complaint from `/portal/complaints/new`; confirm the reference number, requested action, and detail link appear, then confirm it appears in homeowner history.
5. Submit a confidential complaint; confirm the reference number and requested action appear, the case appears in homeowner history/detail, and ordinary admin detail does not display identity values.
6. Submit an anonymous complaint; record the one-time tracking code and PIN.
7. Confirm anonymous complaint does not appear in homeowner complaint history.
8. Open `/complaints/track`; use tracking code and PIN; confirm only public case updates display.
9. Attempt wrong PIN repeatedly; confirm rate limit eventually blocks attempts.
10. Log in as tenant admin or staff; open `/admin/complaints`.
11. Filter by status and privacy mode.
12. Open a complaint detail page.
13. Add a public update; confirm it appears in public tracking or homeowner detail where applicable.
14. Add an internal note; confirm it does not appear in public tracking.
15. Assign a case handler.
16. Change status through allowed transitions to acknowledged, under review, resolved, and closed; confirm invalid direct transitions and missing required reasons fail safely.
17. Confirm status history and timeline update.
18. Request confidential identity access; confirm request is recorded without direct disclosure. With a tenant-configured reveal role, reveal identity only after reason and confirmation, then confirm audit.
19. Upload an allowed attachment and download it as authorized staff.
20. Try an unsupported file type and confirm rejection.
21. Log in as a different tenant and confirm the complaint is inaccessible.
22. Log in as platform admin and confirm tenant complaint content is blocked by default.
23. Open `/admin/complaints/settings`; update SLA/category settings.
24. Open `/admin/complaints/reports`; confirm reports are aggregate and identity-free.

Automated local gate:

```powershell
pnpm run verify:complaint-management
```
