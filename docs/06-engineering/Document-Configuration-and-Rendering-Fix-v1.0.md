# Document Configuration and Rendering Fix v1.0

## Scope

This fix centralizes the visible effective Document Definition rules, clarifies balance-policy setup, renders issued documents as formatted output, and makes admin preview unmistakably non-official.

No schema change was required. Existing fields were reused for workflow, payment, receipt, balance policy, release, visibility, numbering, QR, watermark, subject options, and override audit metadata.

## Root Cause

The workflow engine was functioning, but the administrator screens did not clearly show the resolved effective rules. Balance-policy labels still reflected older technical behavior, the request details page implied no policy existed when rules were stored directly on the Document Definition, and the issued document details page displayed system-generated HTML as plain text.

Preview used safe non-official values, but the output could visually resemble an issued document and some templates contained wording such as "Official document number: PREVIEW".

## Configuration Centralization

The Document Definition edit page now shows:

- workflow preset;
- payment requirement;
- fee amount;
- currency;
- approval requirement;
- approver role or specific approver indication;
- auto-generation behavior;
- receipt requirement and receipt type;
- allow pay later;
- outstanding balance policy;
- release requirement;
- delivery mode;
- numbering format;
- sequence scope;
- validity days;
- maximum copies;
- QR setting;
- watermark setting;
- household-member subject support;
- manual-subject support;
- regeneration policy;
- homeowner visibility/download;
- walk-in availability;
- active/status;
- template and completeness state.

The workflow preset control now displays resolved effective rules directly below the preset selector.

## Balance Policies

The setup UI exposes three business policies:

| Business Policy | Stored Value | Behavior |
| --- | --- | --- |
| Block When Balance Exists | `BLOCK_DOWNLOAD` | Download and printing remain locked while a qualifying unrelated HOA balance exists. |
| Allow Admin Override | `ALLOW_ADMIN_OVERRIDE` | Download and printing are locked until balance clearance or an authorized per-request override. |
| Allow Download With Balance | `IGNORE_BALANCE` | Unrelated HOA balances do not block download or printing after official issuance. |

Legacy `BLOCK_REQUEST` remains understood by runtime compatibility paths but is no longer offered in setup and cannot make a definition requestable.

## Admin Override

The operational action `Allow Release Despite Balance` is shown only when:

- effective policy is `ALLOW_ADMIN_OVERRIDE`;
- request status is `ISSUED`;
- the homeowner has a qualifying balance;
- no override exists;
- the user has an authorized admin role;
- the request belongs to the authenticated tenant.

Revocation is shown only for already overridden issued requests and remains audited by the existing action.

## Issued Rendering

The official document details page now renders trusted system-generated HTML in an isolated iframe using the stored generated document record. It no longer displays escaped raw HTML source to homeowners or admins.

Generic print/PDF fallback paths now extract readable text from generated HTML instead of printing literal markup.

## Preview Clarity

Admin preview remains side-effect free and still uses:

- document number `PREVIEW`;
- preview verification payload;
- no official verification token;
- no issued document record;
- no counter increment;
- no payment or receipt;
- no workflow status update.

Preview output now includes:

- top banner: `PREVIEW ONLY - NOT AN OFFICIAL DOCUMENT`;
- watermark: `PREVIEW - NOT VALID FOR ISSUANCE`;
- preview wording for document number/date labels;
- increased QR label spacing.

## Schema Decision

No migration was created. Existing schema fields were sufficient.

## Deferred Items

- richer PDF rendering of arbitrary generated HTML remains a future renderer enhancement;
- legacy `BLOCK_REQUEST` data cleanup remains a future compatibility task;
- broader visual editor redesign remains out of scope.
