-- Preserve issued-document, approval-history, and verification rows when a
-- request is archived or otherwise removed by future administrative tooling.

ALTER TABLE `DocumentVersion`
  DROP FOREIGN KEY `DocumentVersion_requestId_fkey`,
  ADD CONSTRAINT `DocumentVersion_requestId_restrict_fkey`
    FOREIGN KEY (`requestId`) REFERENCES `DocumentRequest` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentVersion_releasedById_fkey`
    FOREIGN KEY (`releasedById`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentVersion_revokedById_fkey`
    FOREIGN KEY (`revokedById`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `DocumentRequestHistory`
  DROP FOREIGN KEY `DocumentRequestHistory_requestId_fkey`,
  ADD CONSTRAINT `DocumentRequestHistory_requestId_restrict_fkey`
    FOREIGN KEY (`requestId`) REFERENCES `DocumentRequest` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `DocumentVerificationToken`
  DROP FOREIGN KEY `DocumentVerificationToken_tenantId_requestId_fkey`,
  ADD CONSTRAINT `DocumentVerificationToken_tenantId_requestId_restrict_fkey`
    FOREIGN KEY (`tenantId`, `requestId`) REFERENCES `DocumentRequest` (`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
