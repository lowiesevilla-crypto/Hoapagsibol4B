# HOAHub Document Management UI Specification

**Capability:** Tenant Document Repository / Homeowner Document Library  
**Parent Epic:** #77  
**Status:** UI implementation standard  
**Date:** August 9, 2026

## 1. Design Direction

The Document Management experience must present as a production-grade SaaS workspace and remain visually native to HOAHub. It should reuse the platform's established `PageHeader`, `card`, `data-table`, `badge`, `btn-primary`, `btn-secondary`, and destructive action patterns rather than introducing an unrelated visual system.

Design qualities:

- professional and restrained;
- clear information hierarchy;
- strong readability for administrative records;
- minimal visual clutter;
- responsive from mobile to wide desktop;
- accessible keyboard/focus behavior;
- consistent empty, loading, error, success, disabled, and over-quota states;
- destructive actions clearly separated from normal actions;
- no decorative UI that obscures governance or security state.

## 2. Tenant Admin Information Architecture

Recommended route: `/admin/document-management`

### Header

Use the standard HOAHub `PageHeader` pattern.

- Eyebrow: `Association records`
- Title: `Document Management`
- Description: `Manage tenant governance, policy, compliance, communication, and community documents from one secure repository.`
- Primary action: `Upload document`
- Secondary actions: `Categories`, `Audit history`

The header should not be overloaded with more than one primary call-to-action.

### KPI / Summary strip

Show four concise cards on desktop and a horizontally/vertically flowing layout on smaller screens:

1. Total documents
2. Published to homeowners
3. Internal / restricted documents
4. Storage used

Storage card should show used amount, plan limit, utilization percentage, and a progress indicator. Warning semantics should become more prominent at plan thresholds without relying on color alone.

### Repository toolbar

A single visually grouped toolbar contains:

- search input;
- category filter;
- status filter;
- visibility filter;
- file type filter when useful;
- `More filters` for uploader/date/effective/expiry options;
- clear/reset filters action.

Search should remain the dominant control. Advanced filters should not crowd the first view.

### Repository table

Desktop uses the existing HOAHub table vocabulary. Recommended columns:

- Document
- Category
- Reference
- Status
- Visibility
- Revision
- File
- Last updated
- Actions

`Document` cell includes title as the primary line and a short description/original filename as secondary text.

Status and visibility use semantically distinct badges. Do not encode state by color alone; every badge includes a readable label.

Row actions should favor one obvious action (`Open`) plus a compact overflow menu for secondary actions. Avoid six or more adjacent buttons in every row.

### Mobile repository

Do not force the desktop table into a tiny viewport. Under the mobile breakpoint, render document cards containing:

- title;
- category;
- status + visibility badges;
- reference/revision when present;
- file type and size;
- updated date;
- primary Open/Download action;
- overflow menu for authorized administration actions.

Filters become a drawer/sheet or stacked compact controls.

## 3. Upload / Edit Experience

Use a focused form workspace rather than a dense modal for the full metadata model.

Recommended grouping:

### File
- drag-and-drop / file picker;
- selected file name, type, size;
- accepted formats and maximum size;
- clear validation message before submission.

### Document details
- title;
- category;
- description;
- reference/document number;
- tags.

### Publication & access
- visibility with safe default `Internal`;
- status with safe default `Draft`;
- effective date;
- expiry/review date.

### Governance metadata
Shown contextually for applicable categories:

- issuing body/committee;
- approval/adoption date;
- resolution number;
- memorandum number;
- policy code;
- revision label;
- revision reason.

The form should reveal governance fields only when they are relevant, reducing cognitive load.

A sticky or consistently positioned action area should provide `Save draft` / `Upload document` and `Cancel`.

## 4. Document Detail Workspace

Opening a document should lead to a detail page, not immediately trigger a download.

Recommended layout:

- title, category, reference, revision and lifecycle badges in header;
- secure preview panel when previewable;
- metadata side panel or secondary section;
- publication/effective information;
- current binary information (filename, type, size, checksum abbreviated where appropriate);
- audit/revision timeline;
- actions gated by permissions.

Governance documents should visibly show revision lineage and the reason for the current revision.

## 5. Permanent Delete UX

Permanent deletion must look materially different from normal actions.

- Never place `Delete permanently` as the most visually prominent row action.
- Use destructive styling only in the final confirmation step.
- Confirmation displays document title, original filename, size, and revision impact.
- For governance/sensitive records, require typing `DELETE` or the document title before enabling confirmation.
- State clearly that the application has no recycle bin for repository deletion.
- Do not imply infrastructure backups are user-restorable.

## 6. Storage / Subscription States

### Healthy
Normal storage card and upload action.

### Warning
At configured thresholds, show concise warning near storage KPI and upload form.

### At quota
- existing authorized documents remain readable/downloadable;
- upload and replace actions are disabled;
- explain the limit and remediation (`Delete unused files` / `Upgrade plan` when the user has access to plan management).

### Feature not entitled
Hide feature navigation for tenant/homeowner users and reject direct route access server-side. Platform configuration can show the feature as unavailable/upgradeable without exposing repository content.

## 7. Homeowner Document Library

Recommended route: `/homeowner/documents` or existing homeowner navigation convention.

The homeowner experience should be simpler and less administrative.

### Header
- Title: `Document Library`
- Description: `Official documents shared by your association.`

### Discovery
- prominent search;
- category chips/select;
- optional recently updated section;
- cards/list grouped or filterable by governance/community category.

### Document card
- title;
- category;
- short description;
- effective date / updated date;
- file type;
- `View` or `Download` action.

Never show internal status mechanics, storage keys, uploader IDs, admin-only metadata, or inaccessible revision history.

Homeowners with memberships in multiple tenants see only the active tenant's library.

## 8. State Design

Every route must define professional states for:

- skeleton loading;
- no documents yet;
- no search results;
- upload validation failure;
- permission denied;
- subscription not entitled;
- storage over quota;
- preview unsupported;
- secure download failure;
- deleted/missing file inconsistency;
- successful upload/update/publish/delete.

Empty states should explain the next valid action rather than only saying `No data`.

## 9. Accessibility & Interaction

- semantic headings and form labels;
- visible focus states consistent with HOAHub;
- keyboard reachable menus/dialogs;
- minimum comfortable mobile tap targets;
- confirmation dialogs manage focus correctly;
- badges include text, not color-only meaning;
- table/card actions include accessible names;
- errors are associated with the relevant field;
- status messages use appropriate live-region behavior when implemented client-side.

## 10. Visual Consistency Rules

- Reuse HOAHub's existing design tokens/classes before adding new abstractions.
- Use the existing neutral slate typography/background vocabulary unless a global HOAHub redesign changes it.
- Use typography weight to establish hierarchy rather than excessive borders/colors.
- Keep card radii, shadows, input heights, table density, and button treatments consistent with existing admin pages.
- Prefer whitespace and grouping over decorative gradients.
- Do not introduce an independent Document Management color palette.

## 11. UI Acceptance Criteria

1. Desktop repository has a clear page header, KPI strip, filter/search toolbar and legible data workspace.
2. Mobile uses document cards or another purpose-built responsive presentation rather than an unusable wide table.
3. Safe defaults (`Internal`, `Draft`) are visually clear during upload.
4. Status, visibility, quota and entitlement states are understandable without relying on color alone.
5. Destructive delete is separated and requires explicit confirmation.
6. Governance revision lineage is clear on document detail.
7. Homeowner library removes administrative complexity and exposes only tenant-public published content.
8. Loading, empty, error and success states are intentionally designed.
9. The UI reuses HOAHub's established `PageHeader`, card, table, badge and button vocabulary.
10. Tenant-isolation and entitlement rules are enforced server-side regardless of what the UI hides or disables.
