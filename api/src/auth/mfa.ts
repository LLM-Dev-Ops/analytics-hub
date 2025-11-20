/**
 * Multi-Factor Authentication (MFA)
 * TOTP-based two-factor authentication
 */

import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';

export interface MFASetup {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export class MFAManager {
  /**
   * Generate MFA secret and QR code
   */
  async setupMFA(userId: string, email: string): Promise<MFASetup> {
    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `LLM Analytics Hub (${email})`,
      issuer: 'LLM Analytics Hub',
      length: 32,
    });

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();

    return {
      secret: secret.base32,
      qrCodeUrl,
      backupCodes,
    };
  }

  /**
   * Verify TOTP token
   */
  verifyToken(secret: string, token: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2, // Allow 2 time steps before/after for clock skew
    });
  }

  /**
   * Generate backup codes
   */
  private generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      // Generate 8-character alphanumeric code
      const code = this.generateRandomCode(8);
      codes.push(code);
    }
    return codes;
  }

  /**
   * Generate random alphanumeric code
   */
  private generateRandomCode(length: number): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars
    let code = '';
    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Format as XXXX-XXXX for readability
    return code.match(/.{1,4}/g)?.join('-') || code;
  }

  /**
   * Verify backup code
   */
  async verifyBackupCode(
    userId: string,
    code: string,
    usedCodes: string[]
  ): Promise<boolean> {
    // Check if code was already used
    if (usedCodes.includes(code)) {
      return false;
    }

    // Backup codes would be stored in database
    // This is a placeholder for the verification logic
    return true;
  }

  /**
   * Generate current TOTP token (for testing)
   */
  generateToken(secret: string): string {
    return speakeasy.totp({
      secret,
      encoding: 'base32',
    });
  }
}

export const mfaManager = new MFAManager();
