/**
 * Audit Logging System
 * Comprehensive audit trail for compliance (SOC 2, GDPR, HIPAA)
 */

import { FastifyRequest } from 'fastify';
import { AuthenticatedRequest } from './rbac';

export enum AuditAction {
  // Authentication
  USER_LOGIN = 'user.login',
  USER_LOGOUT = 'user.logout',
  USER_LOGIN_FAILED = 'user.login.failed',
  USER_MFA_ENABLED = 'user.mfa.enabled',
  USER_MFA_DISABLED = 'user.mfa.disabled',

  // Authorization
  ACCESS_GRANTED = 'access.granted',
  ACCESS_DENIED = 'access.denied',

  // User management
  USER_CREATED = 'user.created',
  USER_UPDATED = 'user.updated',
  USER_DELETED = 'user.deleted',
  USER_PASSWORD_CHANGED = 'user.password.changed',
  USER_ROLE_CHANGED = 'user.role.changed',

  // Data access
  DATA_READ = 'data.read',
  DATA_CREATED = 'data.created',
  DATA_UPDATED = 'data.updated',
  DATA_DELETED = 'data.deleted',
  DATA_EXPORTED = 'data.exported',

  // API keys
  API_KEY_CREATED = 'api_key.created',
  API_KEY_REVOKED = 'api_key.revoked',
  API_KEY_ROTATED = 'api_key.rotated',

  // System
  CONFIG_CHANGED = 'config.changed',
  BACKUP_CREATED = 'backup.created',
  BACKUP_RESTORED = 'backup.restored',

  // GDPR
  GDPR_DATA_EXPORT_REQUESTED = 'gdpr.data_export.requested',
  GDPR_DATA_EXPORTED = 'gdpr.data_exported',
  GDPR_DATA_DELETION_REQUESTED = 'gdpr.data_deletion.requested',
  GDPR_DATA_DELETED = 'gdpr.data_deleted',

  // Security
  SECURITY_ANOMALY_DETECTED = 'security.anomaly.detected',
  RATE_LIMIT_EXCEEDED = 'security.rate_limit.exceeded',
  SUSPICIOUS_ACTIVITY = 'security.suspicious_activity',
}

export enum AuditSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export interface AuditLog {
  id: string;
  timestamp: Date;
  action: AuditAction;
  severity: AuditSeverity;
  userId?: string;
  userEmail?: string;
  organizationId?: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  details?: Record<string, any>;
  result: 'success' | 'failure';
  errorMessage?: string;
}

export class AuditLogger {
  /**
   * Log audit event
   */
  async log(event: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void> {
    const auditLog: AuditLog = {
      id: this.generateId(),
      timestamp: new Date(),
      ...event,
    };

    // In production, this would:
    // 1. Write to database (TimescaleDB for time-series audit logs)
    // 2. Write to secure audit log file
    // 3. Send to SIEM system
    // 4. Optionally send to compliance monitoring service

    await this.persistAuditLog(auditLog);
    await this.sendToSIEM(auditLog);

    // Log critical events immediately
    if (event.severity === AuditSeverity.CRITICAL) {
      await this.alertSecurityTeam(auditLog);
    }
  }

  /**
   * Log from Fastify request
   */
  async logFromRequest(
    request: FastifyRequest,
    action: AuditAction,
    options: {
      severity?: AuditSeverity;
      resourceType?: string;
      resourceId?: string;
      details?: Record<string, any>;
      result: 'success' | 'failure';
      errorMessage?: string;
    }
  ): Promise<void> {
    const authRequest = request as AuthenticatedRequest;

    await this.log({
      action,
      severity: options.severity || AuditSeverity.INFO,
      userId: authRequest.user?.userId,
      userEmail: authRequest.user?.email,
      organizationId: authRequest.user?.organizationId,
      resourceType: options.resourceType,
      resourceId: options.resourceId,
      ipAddress: this.getClientIP(request),
      userAgent: request.headers['user-agent'],
      sessionId: authRequest.user?.sessionId,
      details: options.details,
      result: options.result,
      errorMessage: options.errorMessage,
    });
  }

  /**
   * Query audit logs (for compliance reports)
   */
  async queryLogs(filters: {
    userId?: string;
    organizationId?: string;
    action?: AuditAction;
    startDate?: Date;
    endDate?: Date;
    resourceType?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: AuditLog[]; total: number }> {
    // In production: Query TimescaleDB
    // SELECT * FROM audit_logs WHERE ...
    return { logs: [], total: 0 };
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    startDate: Date,
    endDate: Date,
    reportType: 'soc2' | 'gdpr' | 'hipaa'
  ): Promise<{
    totalEvents: number;
    criticalEvents: number;
    accessDenials: number;
    dataExports: number;
    dataDeletions: number;
    securityAnomalies: number;
  }> {
    // In production: Aggregate audit logs for compliance reporting
    return {
      totalEvents: 0,
      criticalEvents: 0,
      accessDenials: 0,
      dataExports: 0,
      dataDeletions: 0,
      securityAnomalies: 0,
    };
  }

  /**
   * Get client IP address
   */
  private getClientIP(request: FastifyRequest): string {
    return (
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (request.headers['x-real-ip'] as string) ||
      request.ip ||
      'unknown'
    );
  }

  /**
   * Generate unique audit log ID
   */
  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Persist audit log to database
   */
  private async persistAuditLog(log: AuditLog): Promise<void> {
    // In production:
    // await db.query(`
    //   INSERT INTO audit_logs (id, timestamp, action, severity, user_id, ...)
    //   VALUES ($1, $2, $3, $4, $5, ...)
    // `, [...values]);

    console.log('Audit log:', JSON.stringify(log));
  }

  /**
   * Send to SIEM system
   */
  private async sendToSIEM(log: AuditLog): Promise<void> {
    // In production: Send to Splunk, ELK, or other SIEM
  }

  /**
   * Alert security team for critical events
   */
  private async alertSecurityTeam(log: AuditLog): Promise<void> {
    // In production: Send to PagerDuty, Slack, email
    console.warn('CRITICAL AUDIT EVENT:', log);
  }
}

export const auditLogger = new AuditLogger();

/**
 * Audit middleware decorator
 */
export function auditLog(action: AuditAction, options?: {
  resourceType?: string;
  severity?: AuditSeverity;
}) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const request = args[0] as FastifyRequest;
      let result: 'success' | 'failure' = 'success';
      let errorMessage: string | undefined;
      let resourceId: string | undefined;

      try {
        const response = await originalMethod.apply(this, args);

        // Try to extract resource ID from response
        if (response?.data?.id) {
          resourceId = response.data.id;
        }

        return response;
      } catch (error) {
        result = 'failure';
        errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw error;
      } finally {
        // Log the audit event
        await auditLogger.logFromRequest(request, action, {
          severity: options?.severity || AuditSeverity.INFO,
          resourceType: options?.resourceType,
          resourceId,
          result,
          errorMessage,
        });
      }
    };

    return descriptor;
  };
}
