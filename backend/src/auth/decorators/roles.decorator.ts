import { SetMetadata } from '@nestjs/common';

import { UserRole } from '../../database/entities';

export const ROLES_KEY = 'roles';

/**
 * Controller側で許可するRoleをmetadataとして記録する。
 * 例: `@Roles(UserRole.ADMIN)`を付けると、RolesGuardが作業者を403で拒否する。
 */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
