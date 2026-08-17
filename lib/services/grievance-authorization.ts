import "server-only";

import { Role } from "@prisma/client";
import { platformPrisma } from "@/lib/db";

export type GrievanceActor = {
  id: string;
  tenantId: string;
  roles: Role[];
  role?: Role;
};

const platformRoles = new Set<Role>([Role.SUPER_ADMIN, Role.PLATFORM_ADMIN]);
const grievanceAdminRoles = new Set<Role>([Role.ADMIN, Role.HOA_ADMIN, Role.SYSTEM_ADMIN]);
const grievanceRouteRoles = new Set<Role>([Role.ADMIN, Role.HOA_ADMIN, Role.SYSTEM_ADMIN, Role.STAFF]);

export function grievanceActorRoles(user: GrievanceActor) {
  return new Set<Role>([...(user.roles || []), ...(user.role ? [user.role] : [])]);
}

export function assertGrievanceActorEligible(user: GrievanceActor) {
  const roles = grievanceActorRoles(user);
  if ([...roles].some((role) => platformRoles.has(role))) {
    throw new Error("Platform roles do not receive tenant grievance authority.");
  }
  return roles;
}

export function assertGrievanceAdminAuthority(user: GrievanceActor) {
  const roles = assertGrievanceActorEligible(user);
  if (![...roles].some((role) => grievanceAdminRoles.has(role))) {
    throw new Error("Only an authorized HOA administrator may configure the grievance foundation.");
  }
  return roles;
}

export async function assertCommitteeAppointmentTargetEligible(tenantId: string, userId: string) {
  const target = await platformPrisma.user.findFirst({
    where: { tenantId, id: userId, active: true },
    select: {
      id: true,
      role: true,
      userRoleAssignments: {
        where: { active: true },
        select: { role: true },
      },
    },
  });
  if (!target) throw new Error("Committee member was not found in this HOA.");
  const roles = new Set<Role>([target.role, ...target.userRoleAssignments.map((assignment) => assignment.role)]);
  if ([...roles].some((role) => platformRoles.has(role))) {
    throw new Error("Platform-role users cannot be appointed to a tenant Grievance Committee.");
  }
  if (![...roles].some((role) => grievanceRouteRoles.has(role))) {
    throw new Error("Committee members must have an active complaint-admin or STAFF role before grievance permissions can be granted.");
  }
  return target;
}
