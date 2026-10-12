import jwt from 'jsonwebtoken';
import { JWTManager, JWTPayload } from '../jwt';

const accessSecret = 'access-secret-with-at-least-thirty-two-bytes';
const refreshSecret = 'refresh-secret-with-at-least-thirty-two-bytes';

const payload: JWTPayload = {
  userId: 'user-1',
  email: 'user@example.com',
  roles: ['viewer'],
  permissions: ['analytics:read'],
  sessionId: 'session-1',
  mfaVerified: true,
};

describe('JWTManager', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: accessSecret,
      JWT_REFRESH_SECRET: refreshSecret,
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('fails closed when a production secret is missing', () => {
    delete process.env.JWT_ACCESS_SECRET;

    expect(() => new JWTManager()).toThrow(
      'JWT_ACCESS_SECRET must be configured with at least 32 bytes in production'
    );
  });

  it('rejects short production secrets', () => {
    process.env.JWT_REFRESH_SECRET = 'too-short';

    expect(() => new JWTManager()).toThrow(
      'JWT_REFRESH_SECRET must be configured with at least 32 bytes in production'
    );
  });

  it('requires separate access and refresh secrets', () => {
    process.env.JWT_REFRESH_SECRET = accessSecret;

    expect(() => new JWTManager()).toThrow(
      'JWT access and refresh secrets must be different'
    );
  });

  it('generates and verifies a typed token pair', async () => {
    const manager = new JWTManager();
    const pair = await manager.generateTokenPair(payload);

    await expect(manager.verifyAccessToken(pair.accessToken)).resolves.toMatchObject(payload);
    await expect(manager.verifyRefreshToken(pair.refreshToken)).resolves.toEqual({
      userId: payload.userId,
      sessionId: payload.sessionId,
    });
    await expect(manager.verifyAccessToken(pair.refreshToken)).rejects.toThrow('Invalid token');
  });

  it('rejects a token signed with an unapproved algorithm', async () => {
    const manager = new JWTManager();
    const token = jwt.sign(
      { ...payload, type: 'access' },
      accessSecret,
      {
        algorithm: 'HS384',
        issuer: 'llm-analytics-hub',
        audience: 'llm-analytics-api',
        expiresIn: '15m',
      }
    );

    await expect(manager.verifyAccessToken(token)).rejects.toThrow('Invalid token');
  });

  it('uses ephemeral secrets only outside production', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    const manager = new JWTManager();

    const pair = await manager.generateTokenPair(payload);
    await expect(manager.verifyAccessToken(pair.accessToken)).resolves.toMatchObject(payload);
  });
});
