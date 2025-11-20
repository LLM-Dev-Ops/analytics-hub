/**
 * Role-Based Access Control (RBAC) System
 * Manages roles, permissions, and access control policies
 */

import { FastifyRequest } from 'fastify';

export enum Role {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  ANALYST = 'analyst',
  DEVELOPER = 'developer',
  VIEWER = 'viewer',
  API_CLIENT = 'api_client',
}

export enum Permission {
  // Event permissions
  EVENT_READ = 'event:read',
  EVENT_WRITE = 'event:write',
  EVENT_DELETE = 'event:delete',

  // Metrics permissions
  METRICS_READ = 'metrics:read',
  METRICS_WRITE = 'metrics:write',
  METRICS_DELETE = 'metrics:delete',

  // Dashboard permissions
  DASHBOARD_READ = 'dashboard:read',
  DASHBOARD_WRITE = 'dashboard:write',
  DASHBOARD_DELETE = 'dashboard:delete',

  // User management
  USER_READ = 'user:read',
  USER_WRITE = 'user:write',
  USER_DELETE = 'user:delete',

  // Organization management
  ORG_READ = 'org:read',
  ORG_WRITE = 'org:write',
  ORG_DELETE = 'org:delete',

  // API key management
  API_KEY_READ = 'api_key:read',
  API_KEY_WRITE = 'api_key:write',
  API_KEY_DELETE = 'api_key:delete',

  // System administration
  SYSTEM_CONFIG = 'system:config',
  SYSTEM_AUDIT = 'system:audit',
}

/**
 * Role-Permission mapping
 */
export const RolePermissions: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: [
    // All permissions
    ...Object.values(Permission),
  ],

  [Role.ADMIN]: [
    Permission.EVENT_READ,
    Permission.EVENT_WRITE,
    Permission.EVENT_DELETE,
    Permission.METRICS_READ,
    Permission.METRICS_WRITE,
    Permission.DASHBOARD_READ,
    Permission.DASHBOARD_WRITE,
    Permission.DASHBOARD_DELETE,
    Permission.USER_READ,
    Permission.USER_WRITE,
    Permission.ORG_READ,
    Permission.ORG_WRITE,
    Permission.API_KEY_READ,
    Permission.API_KEY_WRITE,
    Permission.SYSTEM_AUDIT,
  ],

  [Role.ANALYST]: [
    Permission.EVENT_READ,
    Permission.EVENT_WRITE,
    Permission.METRICS_READ,
    Permission.METRICS_WRITE,
    Permission.DASHBOARD_READ,
    Permission.DASHBOARD_WRITE,
  ],

  [Role.DEVELOPER]: [
    Permission.EVENT_READ,
    Permission.EVENT_WRITE,
    Permission.METRICS_READ,
    Permission.DASHBOARD_READ,
    Permission.API_KEY_READ,
    Permission.API_KEY_WRITE,
  ],

  [Role.VIEWER]: [
    Permission.EVENT_READ,
    Permission.METRICS_READ,
    Permission.DASHBOARD_READ,
  ],

  [Role.API_CLIENT]: [
    Permission.EVENT_READ,
    Permission.EVENT_WRITE,
    Permission.METRICS_READ,
  ],
};

/**
 * RBAC Manager
 */
export class RBACManager {
  /**
   * Check if role has permission
   */
  hasPermission(role: Role, permission: Permission): boolean {
    const permissions = RolePermissions[role] || [];
    return permissions.includes(permission);
  }

  /**
   * Check if user has permission (supports multiple roles)
   */
  userHasPermission(roles: Role[], permission: Permission): boolean {
    return roles.some((role) => this.hasPermission(role, permission));
  }

  /**
   * Get all permissions for a role
   */
  getRolePermissions(role: Role): Permission[] {
    return RolePermissions[role] || [];
  }

  /**
   * Get all permissions for user (union of all role permissions)
   */
  getUserPermissions(roles: Role[]): Permission[] {
    const permissions = new Set<Permission>();
    roles.forEach((role) => {
      const rolePerms = this.getRolePermissions(role);
      rolePerms.forEach((perm) => permissions.add(perm));
    });
    return Array.from(permissions);
  }

  /**
   * Check if user has any of the required permissions
   */
  hasAnyPermission(roles: Role[], permissions: Permission[]): boolean {
    return permissions.some((perm) => this.userHasPermission(roles, perm));
  }

  /**
   * Check if user has all required permissions
   */
  hasAllPermissions(roles: Role[], permissions: Permission[]): boolean {
    return permissions.every((perm) => this.userHasPermission(roles, perm));
  }

  /**
   * Validate resource access (attribute-based)
   */
  canAccessResource(
    roles: Role[],
    permission: Permission,
    resource: { organizationId?: string; userId?: string },
    user: { userId: string; organizationId?: string }
  ): boolean {
    // Check base permission
    if (!this.userHasPermission(roles, permission)) {
      return false;
    }

    // Super admin can access everything
    if (roles.includes(Role.SUPER_ADMIN)) {
      return true;
    }

    // Organization-level access control
    if (resource.organizationId && user.organizationId) {
      if (resource.organizationId !== user.organizationId) {
        return false;
      }
    }

    // User-level access control
    if (resource.userId) {
      // Users can access their own resources
      if (resource.userId === user.userId) {
        return true;
      }

      // Admins can access all resources in their org
      if (roles.includes(Role.ADMIN)) {
        return true;
      }

      return false;
    }

    return true;
  }
}

export const rbacManager = new RBACManager();

/**
 * Fastify request with authenticated user
 */
export interface AuthenticatedRequest extends FastifyRequest {
  user: {
    userId: string;
    email: string;
    roles: Role[];
    permissions: Permission[];
    organizationId?: string;
    sessionId: string;
    mfaVerified: boolean;
  };
}

/**
 * Authorization middleware factory
 */
export function requirePermission(...permissions: Permission[]) {
  return async (request: AuthenticatedRequest) => {
    if (!request.user) {
      throw new Error('Authentication required');
    }

    const hasPermission = rbacManager.hasAnyPermission(request.user.roles, permissions);

    if (!hasPermission) {
      throw new Error(
        `Insufficient permissions. Required: ${permissions.join(' or ')}`
      );
    }
  };
}

/**
 * Require all permissions
 */
export function requireAllPermissions(...permissions: Permission[]) {
  return async (request: AuthenticatedRequest) => {
    if (!request.user) {
      throw new Error('Authentication required');
    }

    const hasAllPermissions = rbacManager.hasAllPermissions(
      request.user.roles,
      permissions
    );

    if (!hasAllPermissions) {
      throw new Error(
        `Insufficient permissions. Required: ${permissions.join(' and ')}`
      );
    }
  };
}

/**
 * Require role
 */
export function requireRole(...roles: Role[]) {
  return async (request: AuthenticatedRequest) => {
    if (!request.user) {
      throw new Error('Authentication required');
    }

    const hasRole = request.user.roles.some((role) => roles.includes(role));

    if (!hasRole) {
      throw new Error(`Insufficient role. Required: ${roles.join(' or ')}`);
    }
  };
}
