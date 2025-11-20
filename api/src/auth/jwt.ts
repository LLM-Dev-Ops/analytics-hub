/**
 * JWT Token Management
 * Handles JWT generation, validation, and refresh token management
 */

import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { promisify } from 'util';

const randomBytesAsync = promisify(randomBytes);

export interface JWTPayload {
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
  organizationId?: string;
  sessionId: string;
  mfaVerified: boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class JWTManager {
  private accessTokenSecret: string;
  private refreshTokenSecret: string;
  private accessTokenExpiry: string;
  private refreshTokenExpiry: string;

  constructor() {
    this.accessTokenSecret = process.env.JWT_ACCESS_SECRET || this.generateSecret();
    this.refreshTokenSecret = process.env.JWT_REFRESH_SECRET || this.generateSecret();
    this.accessTokenExpiry = process.env.JWT_ACCESS_EXPIRY || '15m';
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || '7d';
  }

  private generateSecret(): string {
    return randomBytes(64).toString('hex');
  }

  /**
   * Generate access and refresh token pair
   */
  async generateTokenPair(payload: JWTPayload): Promise<TokenPair> {
    const accessToken = jwt.sign(
      {
        ...payload,
        type: 'access',
      },
      this.accessTokenSecret,
      {
        expiresIn: this.accessTokenExpiry,
        issuer: 'llm-analytics-hub',
        audience: 'llm-analytics-api',
      }
    );

    const refreshToken = jwt.sign(
      {
        userId: payload.userId,
        sessionId: payload.sessionId,
        type: 'refresh',
      },
      this.refreshTokenSecret,
      {
        expiresIn: this.refreshTokenExpiry,
        issuer: 'llm-analytics-hub',
        audience: 'llm-analytics-api',
      }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseExpiry(this.accessTokenExpiry),
    };
  }

  /**
   * Verify access token
   */
  async verifyAccessToken(token: string): Promise<JWTPayload> {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret, {
        issuer: 'llm-analytics-hub',
        audience: 'llm-analytics-api',
      }) as JWTPayload & { type: string };

      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      }
      throw error;
    }
  }

  /**
   * Verify refresh token
   */
  async verifyRefreshToken(token: string): Promise<{ userId: string; sessionId: string }> {
    try {
      const decoded = jwt.verify(token, this.refreshTokenSecret, {
        issuer: 'llm-analytics-hub',
        audience: 'llm-analytics-api',
      }) as { userId: string; sessionId: string; type: string };

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      return { userId: decoded.userId, sessionId: decoded.sessionId };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Refresh token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid refresh token');
      }
      throw error;
    }
  }

  /**
   * Decode token without verification (for debugging)
   */
  decodeToken(token: string): any {
    return jwt.decode(token);
  }

  /**
   * Parse expiry string to seconds
   */
  private parseExpiry(expiry: string): number {
    const unit = expiry.slice(-1);
    const value = parseInt(expiry.slice(0, -1));

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return 900; // 15 minutes default
    }
  }

  /**
   * Generate session ID
   */
  async generateSessionId(): Promise<string> {
    const buffer = await randomBytesAsync(32);
    return buffer.toString('hex');
  }
}

export const jwtManager = new JWTManager();
