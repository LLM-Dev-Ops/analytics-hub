/**
 * API Key Management
 * Handles creation, validation, rotation, and revocation of API keys
 */

import { randomBytes, createHash } from 'crypto';
import { promisify } from 'util';

const randomBytesAsync = promisify(randomBytes);

export interface APIKey {
  keyId: string;
  userId: string;
  name: string;
  organizationId?: string;
  hashedKey: string;
  prefix: string;
  createdAt: Date;
  expiresAt?: Date;
  lastUsedAt?: Date;
  revokedAt?: Date;
  scopes: string[];
}

export interface APIKeyData {
  keyId: string;
  userId: string;
  name: string;
  organizationId?: string;
  scopes: string[];
}

export class APIKeyManager {
  /**
   * Generate new API key
   */
  async generateAPIKey(
    userId: string,
    name: string,
    options: {
      organizationId?: string;
      expiresIn?: number; // days
      scopes?: string[];
    } = {}
  ): Promise<{ key: string; keyData: APIKey }> {
    // Generate random key
    const randomKey = await randomBytesAsync(32);
    const keyString = randomKey.toString('base64url');

    // Create prefix for key identification
    const prefix = keyString.substring(0, 8);

    // Hash the key for storage
    const hashedKey = this.hashKey(keyString);

    // Generate unique key ID
    const keyId = this.generateKeyId();

    const keyData: APIKey = {
      keyId,
      userId,
      name,
      organizationId: options.organizationId,
      hashedKey,
      prefix,
      createdAt: new Date(),
      expiresAt: options.expiresIn
        ? new Date(Date.now() + options.expiresIn * 86400000)
        : undefined,
      scopes: options.scopes || [],
    };

    // In production, save to database
    await this.saveKey(keyData);

    // Return the raw key (only time it's shown)
    return {
      key: `llmah_${keyString}`,
      keyData,
    };
  }

  /**
   * Validate API key
   */
  async validateKey(key: string): Promise<APIKeyData | null> {
    // Check format
    if (!key.startsWith('llmah_')) {
      return null;
    }

    const keyString = key.substring(6);
    const hashedKey = this.hashKey(keyString);

    // Look up key in database
    const keyData = await this.findKeyByHash(hashedKey);

    if (!keyData) {
      return null;
    }

    // Check if revoked
    if (keyData.revokedAt) {
      return null;
    }

    // Check if expired
    if (keyData.expiresAt && keyData.expiresAt < new Date()) {
      return null;
    }

    // Update last used timestamp
    await this.updateLastUsed(keyData.keyId);

    return {
      keyId: keyData.keyId,
      userId: keyData.userId,
      name: keyData.name,
      organizationId: keyData.organizationId,
      scopes: keyData.scopes,
    };
  }

  /**
   * Revoke API key
   */
  async revokeKey(keyId: string): Promise<void> {
    // In production, update database
    await this.updateKeyRevocation(keyId, new Date());
  }

  /**
   * Rotate API key (create new, revoke old)
   */
  async rotateKey(
    oldKeyId: string,
    userId: string,
    name: string
  ): Promise<{ key: string; keyData: APIKey }> {
    // Get old key data
    const oldKeyData = await this.getKeyById(oldKeyId);

    if (!oldKeyData) {
      throw new Error('Key not found');
    }

    // Create new key with same settings
    const newKey = await this.generateAPIKey(userId, name, {
      organizationId: oldKeyData.organizationId,
      scopes: oldKeyData.scopes,
    });

    // Revoke old key
    await this.revokeKey(oldKeyId);

    return newKey;
  }

  /**
   * List user's API keys
   */
  async listUserKeys(userId: string): Promise<Partial<APIKey>[]> {
    // In production, query database
    // Return sanitized key data (no hashed keys)
    return [];
  }

  /**
   * Hash API key for storage
   */
  private hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  /**
   * Generate unique key ID
   */
  private generateKeyId(): string {
    return `key_${randomBytes(16).toString('hex')}`;
  }

  /**
   * Database operations (placeholders)
   */
  private async saveKey(keyData: APIKey): Promise<void> {
    // In production: INSERT INTO api_keys ...
    console.log('Saving API key:', keyData.keyId);
  }

  private async findKeyByHash(hashedKey: string): Promise<APIKey | null> {
    // In production: SELECT * FROM api_keys WHERE hashed_key = ?
    return null;
  }

  private async updateLastUsed(keyId: string): Promise<void> {
    // In production: UPDATE api_keys SET last_used_at = NOW() WHERE key_id = ?
  }

  private async updateKeyRevocation(keyId: string, revokedAt: Date): Promise<void> {
    // In production: UPDATE api_keys SET revoked_at = ? WHERE key_id = ?
  }

  private async getKeyById(keyId: string): Promise<APIKey | null> {
    // In production: SELECT * FROM api_keys WHERE key_id = ?
    return null;
  }
}

export const apiKeyManager = new APIKeyManager();
