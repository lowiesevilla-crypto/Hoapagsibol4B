-- Allow one verified email address to own multiple homeowner/user accounts
-- inside the same tenant. Account numbers and all business data remain
-- independently tenant-scoped by the existing tenant boundary middleware.
DROP INDEX `User_tenantId_email_key` ON `User`;
CREATE INDEX `User_tenantId_email_active_idx` ON `User`(`tenantId`, `email`, `active`);
