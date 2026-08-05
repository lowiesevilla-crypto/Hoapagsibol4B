import { readFile, writeFile } from "node:fs/promises";

async function patch(file, transform) {
  const before = await readFile(file, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`${file}: expected patch made no changes`);
  await writeFile(file, after);
  console.log(`patched ${file}`);
}

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`missing ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`duplicate ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

await patch("prisma/schema.prisma", (source) => {
  let next = source;
  next = replaceOnce(
    next,
    "  userRoleAssignments        UserRoleAssignment[]\n  billingRules               BillingRule[]",
    "  userRoleAssignments        UserRoleAssignment[]\n  customRoles                TenantCustomRole[]\n  customRolePermissions      TenantCustomRolePermission[]\n  customRoleAssignments      UserTenantCustomRoleAssignment[]\n  billingRules               BillingRule[]",
    "Tenant custom-role relations",
  );
  next = replaceOnce(
    next,
    "  userRoleAssignments                   UserRoleAssignment[]\n  assignedRoleAssignments               UserRoleAssignment[]              @relation(\"UserRoleAssignmentAssignedBy\")",
    "  userRoleAssignments                   UserRoleAssignment[]\n  assignedRoleAssignments               UserRoleAssignment[]              @relation(\"UserRoleAssignmentAssignedBy\")\n  tenantCustomRoleAssignments           UserTenantCustomRoleAssignment[]  @relation(\"TenantCustomRoleAssignmentUser\")\n  tenantCustomRoleAssignmentsGranted    UserTenantCustomRoleAssignment[]  @relation(\"TenantCustomRoleAssignmentAssignedBy\")\n  tenantCustomRolesCreated              TenantCustomRole[]                 @relation(\"TenantCustomRoleCreatedBy\")\n  tenantCustomRolesUpdated              TenantCustomRole[]                 @relation(\"TenantCustomRoleUpdatedBy\")",
    "User custom-role relations",
  );
  next = replaceOnce(
    next,
    "model TenantModuleEntitlement {",
    `model TenantCustomRole {
  id          String   @id @default(cuid())
  tenantId    String
  name        String   @db.VarChar(100)
  key         String   @db.VarChar(80)
  description String?  @db.VarChar(500)
  active      Boolean  @default(true)
  createdById String?
  updatedById String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  createdBy   User?    @relation("TenantCustomRoleCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  updatedBy   User?    @relation("TenantCustomRoleUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
  permissions TenantCustomRolePermission[]
  assignments UserTenantCustomRoleAssignment[]

  @@unique([tenantId, name])
  @@unique([tenantId, key])
  @@index([tenantId, active])
}

model TenantCustomRolePermission {
  tenantId   String
  roleId     String
  permission String
  tenant     Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  role       TenantCustomRole @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@id([roleId, permission])
  @@index([tenantId, permission])
}

model UserTenantCustomRoleAssignment {
  tenantId       String
  userId         String
  roleId         String
  assignedBy     String?
  assignedAt     DateTime         @default(now())
  active         Boolean          @default(true)
  tenant         Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user           User             @relation("TenantCustomRoleAssignmentUser", fields: [userId], references: [id], onDelete: Cascade)
  role           TenantCustomRole @relation(fields: [roleId], references: [id], onDelete: Cascade)
  assignedByUser User?            @relation("TenantCustomRoleAssignmentAssignedBy", fields: [assignedBy], references: [id], onDelete: SetNull)

  @@id([tenantId, userId, roleId])
  @@index([tenantId, active, roleId])
  @@index([userId, active])
}

model TenantModuleEntitlement {`,
    "custom-role models",
  );
  return next;
});

await patch("components/sidebar-links.ts", (source) => replaceOnce(
  source,
  '  { href: "/admin/data/migrations", label: "Balance migration", icon: "data", section: "Reports" },\n];',
  '  { href: "/admin/data/migrations", label: "Balance migration", icon: "data", section: "Reports" },\n  { href: "/admin/settings/roles", label: "Roles & permissions", icon: "settings", section: "Settings" },\n];',
  "roles navigation",
));

await patch("lib/actions/homeowners.ts", (source) => replaceOnce(
  source,
  `            role: Role.HOMEOWNER,
            homeownerProfile: {`,
  `            role: Role.HOMEOWNER,
            userRoleAssignments: {
              create: {
                tenantId: input.tenantId,
                role: Role.HOMEOWNER,
                active: true,
                assignedBy: input.createdById,
              },
            },
            homeownerProfile: {`,
  "explicit homeowner role assignment",
));

await patch("lib/services/passkeys.ts", (source) => {
  let next = replaceOnce(
    source,
    'import { HomeownerActivationStatus, HomeownerEmailVerificationStatus, PasskeyChallengeType, Role } from "@prisma/client";',
    'import { HomeownerActivationStatus, HomeownerEmailVerificationStatus, PasskeyChallengeType } from "@prisma/client";',
    "passkey Role import",
  );
  const roleFilterPattern = /^\s*role: Role\.HOMEOWNER,\n/gm;
  const matches = next.match(roleFilterPattern) ?? [];
  if (matches.length !== 2) throw new Error(`expected 2 homeowner role filters, found ${matches.length}`);
  next = next.replace(roleFilterPattern, "");
  next = replaceOnce(
    next,
    "  if (!credentialRecord || !credentialRecord.user.active || credentialRecord.user.role !== Role.HOMEOWNER || homeownerProfile?.activationStatus !== HomeownerActivationStatus.ACTIVE || homeownerProfile?.emailStatus !== HomeownerEmailVerificationStatus.VERIFIED || !homeownerProfile?.activatedAt) {",
    "  if (!credentialRecord || !credentialRecord.user.active || !homeownerProfile || homeownerProfile.activationStatus !== HomeownerActivationStatus.ACTIVE || homeownerProfile.emailStatus !== HomeownerEmailVerificationStatus.VERIFIED || !homeownerProfile.activatedAt) {",
    "passkey homeowner identity check",
  );
  return next;
});

console.log("custom-role schema and compatibility patches applied");
