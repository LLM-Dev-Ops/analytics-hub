/**
 * Authentication Middleware
 * Handles JWT validation, API key authentication, and request decoration
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { jwtManager } from './jwt';
import { rbacManager, Role, Permission, AuthenticatedRequest } from './rbac';
import { apiKeyManager } from './api-keys';

export interface AuthOptions {
  required?: boolean;
  allowApiKey?: boolean;
  requireMFA?: boolean;
}

/**
 * Authentication middleware
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
  options: AuthOptions = {}
) {
  const { required = true, allowApiKey = true, requireMFA = false } = options;

  try {
    // Try JWT authentication first
    const authHeader = request.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = await jwtManager.verifyAccessToken(token);

      // Check MFA requirement
      if (requireMFA && !payload.mfaVerified) {
        throw new Error('MFA verification required');
      }

      // Get user permissions
      const permissions = rbacManager.getUserPermissions(
        payload.roles as Role[]
      );

      // Decorate request with user info
      (request as AuthenticatedRequest).user = {
        ...payload,
        roles: payload.roles as Role[],
        permissions: permissions as Permission[],
      };

      return;
    }

    // Try API Key authentication
    if (allowApiKey) {
      const apiKey = request.headers['x-api-key'] as string;

      if (apiKey) {
        const keyData = await apiKeyManager.validateKey(apiKey);

        if (keyData) {
          // Decorate request with API key user info
          (request as AuthenticatedRequest).user = {
            userId: keyData.userId,
            email: keyData.name,
            roles: [Role.API_CLIENT],
            permissions: rbacManager.getRolePermissions(Role.API_CLIENT),
            organizationId: keyData.organizationId,
            sessionId: keyData.keyId,
            mfaVerified: false, // API keys don't require MFA
          };

          return;
        }
      }
    }

    // No valid authentication found
    if (required) {
      throw new Error('Authentication required');
    }
  } catch (error) {
    if (required) {
      reply.code(401).send({
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      });
      return;
    }
  }
}

/**
 * Require authentication (throws error if not authenticated)
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
) {
  await authenticate(request, reply, { required: true });
}

/**
 * Optional authentication (doesn't throw if not authenticated)
 */
export async function optionalAuth(
  request: FastifyRequest,
  reply: FastifyReply
) {
  await authenticate(request, reply, { required: false });
}

/**
 * Require MFA
 */
export async function requireMFA(
  request: FastifyRequest,
  reply: FastifyReply
) {
  await authenticate(request, reply, { required: true, requireMFA: true });
}

/**
 * CSRF Token Validation Middleware
 */
export async function validateCSRF(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Skip CSRF for GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    return;
  }

  const csrfToken = request.headers['x-csrf-token'] as string;
  const sessionToken = request.headers['x-session-token'] as string;

  if (!csrfToken || !sessionToken) {
    reply.code(403).send({
      success: false,
      error: 'CSRF token required',
    });
    return;
  }

  // Validate CSRF token (would check against session in production)
  // This is a simplified version
  const isValid = await validateCSRFToken(csrfToken, sessionToken);

  if (!isValid) {
    reply.code(403).send({
      success: false,
      error: 'Invalid CSRF token',
    });
    return;
  }
}

async function validateCSRFToken(
  csrfToken: string,
  sessionToken: string
): Promise<boolean> {
  // In production, this would:
  // 1. Look up session in Redis/database
  // 2. Verify CSRF token matches session
  // 3. Check token expiry
  // For now, returning true as placeholder
  return true;
}

/**
 * Rate limiting by user
 */
export function createUserRateLimiter(max: number, timeWindow: number) {
  const userLimits = new Map<string, { count: number; resetAt: number }>();

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as AuthenticatedRequest).user;

    if (!user) {
      return; // No user, skip rate limiting
    }

    const userId = user.userId;
    const now = Date.now();

    let userLimit = userLimits.get(userId);

    if (!userLimit || userLimit.resetAt < now) {
      // Create new limit window
      userLimit = {
        count: 0,
        resetAt: now + timeWindow,
      };
      userLimits.set(userId, userLimit);
    }

    userLimit.count++;

    if (userLimit.count > max) {
      const retryAfter = Math.ceil((userLimit.resetAt - now) / 1000);

      reply.code(429).header('Retry-After', retryAfter.toString()).send({
        success: false,
        error: 'Rate limit exceeded',
        retryAfter,
      });
      return;
    }

    // Add rate limit headers
    reply.header('X-RateLimit-Limit', max.toString());
    reply.header('X-RateLimit-Remaining', (max - userLimit.count).toString());
    reply.header(
      'X-RateLimit-Reset',
      Math.ceil(userLimit.resetAt / 1000).toString()
    );
  };
}
