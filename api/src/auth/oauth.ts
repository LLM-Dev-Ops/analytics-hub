/**
 * OAuth 2.0 / OIDC Integration
 * Supports Keycloak, Auth0, Okta, and other OIDC providers
 */

import { Issuer, Client, generators, TokenSet } from 'openid-client';
import { jwtManager } from './jwt';
import { Role } from './rbac';

export interface OAuthConfig {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface OAuthUser {
  sub: string; // subject (user ID from provider)
  email: string;
  email_verified: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  roles?: string[];
  groups?: string[];
}

export class OAuthManager {
  private client: Client | null = null;
  private issuer: Issuer | null = null;
  private config: OAuthConfig;

  constructor(config?: OAuthConfig) {
    this.config = config || {
      issuerUrl:
        process.env.OAUTH_ISSUER_URL ||
        'https://keycloak.llm-analytics.com/realms/llm-analytics',
      clientId: process.env.OAUTH_CLIENT_ID || 'llm-analytics-hub',
      clientSecret: process.env.OAUTH_CLIENT_SECRET || '',
      redirectUri:
        process.env.OAUTH_REDIRECT_URI ||
        'https://app.llm-analytics.com/auth/callback',
      scopes: ['openid', 'profile', 'email', 'roles'],
    };
  }

  /**
   * Initialize OAuth client
   */
  async initialize(): Promise<void> {
    this.issuer = await Issuer.discover(this.config.issuerUrl);

    this.client = new this.issuer.Client({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uris: [this.config.redirectUri],
      response_types: ['code'],
    });
  }

  /**
   * Get authorization URL
   */
  async getAuthorizationUrl(state?: string): Promise<{ url: string; state: string; nonce: string }> {
    if (!this.client) {
      await this.initialize();
    }

    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    const nonce = generators.nonce();
    const stateValue = state || generators.state();

    const authUrl = this.client!.authorizationUrl({
      scope: this.config.scopes.join(' '),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: stateValue,
      nonce,
    });

    // Store code verifier for token exchange (would use Redis in production)
    await this.storeCodeVerifier(stateValue, codeVerifier);

    return {
      url: authUrl,
      state: stateValue,
      nonce,
    };
  }

  /**
   * Handle OAuth callback
   */
  async handleCallback(
    callbackUrl: string,
    expectedState: string
  ): Promise<{ user: OAuthUser; tokens: TokenSet }> {
    if (!this.client) {
      await this.initialize();
    }

    // Retrieve code verifier
    const codeVerifier = await this.getCodeVerifier(expectedState);

    if (!codeVerifier) {
      throw new Error('Invalid state or expired session');
    }

    // Exchange authorization code for tokens
    const params = this.client!.callbackParams(callbackUrl);
    const tokenSet = await this.client!.callback(
      this.config.redirectUri,
      params,
      {
        code_verifier: codeVerifier,
        state: expectedState,
      }
    );

    // Get user info from token claims
    const claims = tokenSet.claims() as OAuthUser;

    // Optionally fetch additional user info
    const userinfo = await this.client!.userinfo(tokenSet);

    const user: OAuthUser = {
      sub: claims.sub,
      email: claims.email || (userinfo.email as string),
      email_verified: claims.email_verified || false,
      name: claims.name || (userinfo.name as string),
      given_name: claims.given_name || (userinfo.given_name as string),
      family_name: claims.family_name || (userinfo.family_name as string),
      picture: claims.picture || (userinfo.picture as string),
      roles: claims.roles || this.extractRoles(claims),
      groups: claims.groups || (userinfo.groups as string[]),
    };

    // Clean up code verifier
    await this.deleteCodeVerifier(expectedState);

    return { user, tokens: tokenSet };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<TokenSet> {
    if (!this.client) {
      await this.initialize();
    }

    return await this.client!.refresh(refreshToken);
  }

  /**
   * Revoke token
   */
  async revokeToken(token: string, tokenTypeHint?: 'access_token' | 'refresh_token'): Promise<void> {
    if (!this.client) {
      await this.initialize();
    }

    await this.client!.revoke(token, tokenTypeHint);
  }

  /**
   * End session (logout)
   */
  async endSession(idToken: string, postLogoutRedirectUri?: string): Promise<string> {
    if (!this.client) {
      await this.initialize();
    }

    return this.client!.endSessionUrl({
      id_token_hint: idToken,
      post_logout_redirect_uri:
        postLogoutRedirectUri || 'https://app.llm-analytics.com',
    });
  }

  /**
   * Map OAuth user to internal user and generate JWT
   */
  async createInternalSession(oauthUser: OAuthUser): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    // Map OAuth roles to internal roles
    const internalRoles = this.mapOAuthRolesToInternal(oauthUser.roles || []);

    // Generate session ID
    const sessionId = await jwtManager.generateSessionId();

    // Generate JWT tokens
    const tokens = await jwtManager.generateTokenPair({
      userId: oauthUser.sub,
      email: oauthUser.email,
      roles: internalRoles,
      permissions: [], // Will be populated by RBAC middleware
      sessionId,
      mfaVerified: false, // OAuth doesn't guarantee MFA
    });

    return tokens;
  }

  /**
   * Extract roles from OAuth claims
   */
  private extractRoles(claims: any): string[] {
    // Try different claim paths where roles might be stored
    const rolePaths = [
      'roles',
      'realm_access.roles',
      'resource_access.llm-analytics-hub.roles',
      'groups',
    ];

    for (const path of rolePaths) {
      const value = this.getNestedValue(claims, path);
      if (Array.isArray(value)) {
        return value;
      }
    }

    return [];
  }

  /**
   * Get nested object value by path
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Map OAuth roles to internal RBAC roles
   */
  private mapOAuthRolesToInternal(oauthRoles: string[]): Role[] {
    const roleMap: Record<string, Role> = {
      'super-admin': Role.SUPER_ADMIN,
      'super_admin': Role.SUPER_ADMIN,
      'admin': Role.ADMIN,
      'administrator': Role.ADMIN,
      'analyst': Role.ANALYST,
      'data-analyst': Role.ANALYST,
      'developer': Role.DEVELOPER,
      'dev': Role.DEVELOPER,
      'viewer': Role.VIEWER,
      'read-only': Role.VIEWER,
    };

    const mappedRoles: Role[] = [];

    for (const oauthRole of oauthRoles) {
      const normalizedRole = oauthRole.toLowerCase();
      if (roleMap[normalizedRole]) {
        mappedRoles.push(roleMap[normalizedRole]);
      }
    }

    // Default to viewer if no roles matched
    return mappedRoles.length > 0 ? mappedRoles : [Role.VIEWER];
  }

  /**
   * Store code verifier (would use Redis in production)
   */
  private async storeCodeVerifier(state: string, verifier: string): Promise<void> {
    // In production: await redis.setex(`oauth:verifier:${state}`, 600, verifier);
  }

  /**
   * Get code verifier (would use Redis in production)
   */
  private async getCodeVerifier(state: string): Promise<string | null> {
    // In production: return await redis.get(`oauth:verifier:${state}`);
    return null;
  }

  /**
   * Delete code verifier (would use Redis in production)
   */
  private async deleteCodeVerifier(state: string): Promise<void> {
    // In production: await redis.del(`oauth:verifier:${state}`);
  }
}

export const oauthManager = new OAuthManager();
