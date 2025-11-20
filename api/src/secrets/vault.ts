/**
 * HashiCorp Vault Integration
 * Manages secrets, dynamic credentials, and encryption keys
 */

import * as vault from 'node-vault';

export interface VaultConfig {
  endpoint: string;
  token?: string;
  roleId?: string;
  secretId?: string;
  namespace?: string;
}

export class VaultManager {
  private client: any;
  private config: VaultConfig;
  private tokenRenewalInterval?: NodeJS.Timeout;

  constructor(config?: VaultConfig) {
    this.config = config || {
      endpoint: process.env.VAULT_ADDR || 'http://vault.llm-analytics.svc.cluster.local:8200',
      token: process.env.VAULT_TOKEN,
      roleId: process.env.VAULT_ROLE_ID,
      secretId: process.env.VAULT_SECRET_ID,
      namespace: process.env.VAULT_NAMESPACE || 'llm-analytics',
    };
  }

  /**
   * Initialize Vault client
   */
  async initialize(): Promise<void> {
    this.client = vault({
      apiVersion: 'v1',
      endpoint: this.config.endpoint,
      token: this.config.token,
      namespace: this.config.namespace,
    });

    // If using AppRole authentication
    if (this.config.roleId && this.config.secretId && !this.config.token) {
      await this.loginWithAppRole();
    }

    // Set up token renewal
    await this.setupTokenRenewal();
  }

  /**
   * Login with AppRole
   */
  private async loginWithAppRole(): Promise<void> {
    const result = await this.client.approleLogin({
      role_id: this.config.roleId,
      secret_id: this.config.secretId,
    });

    this.client.token = result.auth.client_token;
  }

  /**
   * Read secret from KV v2 store
   */
  async readSecret(path: string): Promise<Record<string, any>> {
    const result = await this.client.read(`secret/data/${path}`);
    return result.data.data;
  }

  /**
   * Write secret to KV v2 store
   */
  async writeSecret(path: string, data: Record<string, any>): Promise<void> {
    await this.client.write(`secret/data/${path}`, { data });
  }

  /**
   * Delete secret
   */
  async deleteSecret(path: string): Promise<void> {
    await this.client.delete(`secret/data/${path}`);
  }

  /**
   * Get database credentials (dynamic secrets)
   */
  async getDatabaseCredentials(role: string = 'llm-analytics-app'): Promise<{
    username: string;
    password: string;
    ttl: number;
  }> {
    const result = await this.client.read(`database/creds/${role}`);

    return {
      username: result.data.username,
      password: result.data.password,
      ttl: result.lease_duration,
    };
  }

  /**
   * Renew database credentials lease
   */
  async renewDatabaseLease(leaseId: string): Promise<void> {
    await this.client.write('sys/leases/renew', {
      lease_id: leaseId,
    });
  }

  /**
   * Encrypt data with transit engine
   */
  async encrypt(plaintext: string, keyName: string = 'llm-analytics'): Promise<string> {
    const result = await this.client.write(`transit/encrypt/${keyName}`, {
      plaintext: Buffer.from(plaintext).toString('base64'),
    });

    return result.data.ciphertext;
  }

  /**
   * Decrypt data with transit engine
   */
  async decrypt(ciphertext: string, keyName: string = 'llm-analytics'): Promise<string> {
    const result = await this.client.write(`transit/decrypt/${keyName}`, {
      ciphertext,
    });

    return Buffer.from(result.data.plaintext, 'base64').toString('utf-8');
  }

  /**
   * Generate random bytes (for keys, tokens, etc.)
   */
  async generateRandomBytes(bytes: number = 32, format: 'hex' | 'base64' = 'hex'): Promise<string> {
    const result = await this.client.write('sys/tools/random', {
      bytes,
      format,
    });

    return result.data.random_bytes;
  }

  /**
   * Get PKI certificate
   */
  async getCertificate(commonName: string, role: string = 'llm-analytics'): Promise<{
    certificate: string;
    privateKey: string;
    ca: string;
    expiration: Date;
  }> {
    const result = await this.client.write(`pki/issue/${role}`, {
      common_name: commonName,
      ttl: '2160h', // 90 days
    });

    return {
      certificate: result.data.certificate,
      privateKey: result.data.private_key,
      ca: result.data.issuing_ca,
      expiration: new Date(Date.now() + result.lease_duration * 1000),
    };
  }

  /**
   * Setup automatic token renewal
   */
  private async setupTokenRenewal(): Promise<void> {
    try {
      // Lookup token to get TTL
      const tokenInfo = await this.client.tokenLookupSelf();
      const ttl = tokenInfo.data.ttl;

      if (ttl > 0) {
        // Renew token at 75% of TTL
        const renewInterval = (ttl * 0.75) * 1000;

        this.tokenRenewalInterval = setInterval(async () => {
          try {
            await this.client.tokenRenewSelf();
            console.log('Vault token renewed successfully');
          } catch (error) {
            console.error('Failed to renew Vault token:', error);
          }
        }, renewInterval);
      }
    } catch (error) {
      console.warn('Failed to setup token renewal:', error);
    }
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    if (this.tokenRenewalInterval) {
      clearInterval(this.tokenRenewalInterval);
    }
  }
}

export const vaultManager = new VaultManager();

/**
 * Secrets cache with automatic refresh
 */
export class SecretCache {
  private cache = new Map<string, { value: any; expiresAt: number }>();
  private vaultManager: VaultManager;

  constructor(vaultManager: VaultManager) {
    this.vaultManager = vaultManager;
  }

  /**
   * Get secret with caching
   */
  async get(path: string, ttl: number = 300): Promise<Record<string, any>> {
    const cached = this.cache.get(path);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const value = await this.vaultManager.readSecret(path);

    this.cache.set(path, {
      value,
      expiresAt: Date.now() + ttl * 1000,
    });

    return value;
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clear specific secret
   */
  delete(path: string): void {
    this.cache.delete(path);
  }
}

export const secretCache = new SecretCache(vaultManager);
