# Email Delivery NEXT_REDIRECT Hotfix

Production observation: bulk Email Delivery Management actions completed their database transaction and then called Next.js `redirect()` from inside the same `try` block. Because `redirect()` uses the `NEXT_REDIRECT` control-flow exception, the local `catch` incorrectly converted a successful action into an error banner containing `NEXT_REDIRECT`.

Hotfix: database work remains inside the guarded `try/catch`; success redirects are executed only after the `try/catch` has completed. This preserves the existing tenant scope, audit logging, protected worker delivery path, queue removal semantics, and pagination behavior.

No schema, migration, billing, payment, or SMTP-provider changes are included.