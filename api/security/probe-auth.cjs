const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { resolve, join } = require('node:path');
const { performance } = require('node:perf_hooks');
const contract = require('./contract.json');

const secrets = { access: 'synthetic-access-fixture-not-a-real-secret-20261019', refresh: 'synthetic-refresh-fixture-not-a-real-secret-20261019' };

async function probeAuth(root, names = [...contract.holdout, ...contract.anchor]) {
  root = resolve(root);
  const previous = { ...process.env };
  Object.assign(process.env, { NODE_ENV: 'production', JWT_ACCESS_SECRET: secrets.access, JWT_REFRESH_SECRET: secrets.refresh });
  const req = createRequire(join(root, 'package.json'));
  const jwt = req('jsonwebtoken');
  const { JWTManager } = req(join(root, 'dist/auth/jwt.js'));
  const { RBACManager, Role, Permission } = req(join(root, 'dist/auth/rbac.js'));
  const manager = new JWTManager(), rbac = new RBACManager();
  const payload = { userId: 'fixture-user', email: 'fixture@example.invalid', roles: ['viewer'], permissions: ['event:read'], sessionId: 'fixture-session', mfaVerified: true };
  const sign = (claims, type = 'access', expiry = true, algorithm = 'HS256') => jwt.sign({ ...claims, type }, secrets[type], {
    algorithm, issuer: 'llm-analytics-hub', audience: 'llm-analytics-api', ...(expiry ? { expiresIn: '15m' } : {}),
  });
  const resource = { organizationId: 'tenant-a', userId: 'other-user' };
  const rows = [];
  let app;
  try {
    if (names.some(x => x.startsWith('http-'))) {
      const Fastify = req('fastify');
      const { requireMFA, requireAuth } = req(join(root, 'dist/auth/middleware.js'));
      app = Fastify({ logger: false });
      app.get('/mfa', { preHandler: requireMFA }, async () => ({ success: true }));
      app.get('/tenant', { preHandler: requireAuth }, async (request, reply) => {
        const allowed = rbac.canAccessResource(request.user.roles, Permission.EVENT_READ, resource, request.user);
        return reply.code(allowed ? 200 : 403).send({ allowed });
      });
      await app.listen({ host: '127.0.0.1', port: 0 });
    }
    for (const name of names) {
      assert([...contract.holdout, ...contract.anchor].includes(name));
      const started = performance.now();
      let pass = false, observed, error;
      try {
        if (contract.holdout.includes(name) && (name.startsWith('access-') || name.startsWith('refresh-'))) {
          const refresh = name.startsWith('refresh-'), value = { ...payload };
          const edits = {
            'access-user-missing': ['userId', undefined], 'access-user-empty': ['userId', ''], 'access-user-number': ['userId', 1],
            'access-email-missing': ['email', undefined], 'access-roles-string': ['roles', 'viewer'], 'access-permissions-null': ['permissions', null],
            'access-session-missing': ['sessionId', undefined], 'access-mfa-string': ['mfaVerified', 'false'], 'access-mfa-missing': ['mfaVerified', undefined],
            'access-org-empty': ['organizationId', ''], 'refresh-user-missing': ['userId', undefined], 'refresh-session-number': ['sessionId', 1],
          };
          const edit = edits[name];
          if (edit) { if (edit[1] === undefined) delete value[edit[0]]; else value[edit[0]] = edit[1]; }
          const token = sign(value, refresh ? 'refresh' : 'access', !name.endsWith('exp-missing'));
          try { await (refresh ? manager.verifyRefreshToken(token) : manager.verifyAccessToken(token)); observed = 'accepted'; }
          catch { observed = 'rejected'; }
          pass = observed === 'rejected';
        } else if (name.startsWith('http-')) {
          const claims = name === 'http-tenant-missing-org' ? { ...payload, roles: ['admin'] } : { ...payload, mfaVerified: name === 'http-mfa-string' ? 'false' : name !== 'http-mfa-false-denied' };
          const response = await fetch(`http://127.0.0.1:${app.server.address().port}/${name.includes('tenant') ? 'tenant' : 'mfa'}`, {
            headers: { authorization: `Bearer ${sign(claims)}` }, signal: AbortSignal.timeout(3000),
          });
          observed = { status: response.status, body: await response.json() };
          pass = response.status === (name === 'http-mfa-boolean' ? 200 : name === 'http-tenant-missing-org' ? 403 : 401);
        } else if (name.startsWith('tenant-') || name.includes('tenant') || name.includes('owner') || name === 'super-admin-explicit-bypass') {
          let roles = [Role.ADMIN], target = resource, user = { userId: 'fixture-user' }, expected = false;
          if (name === 'tenant-owner-missing-org') { roles = [Role.VIEWER]; user = { userId: 'other-user' }; }
          if (name === 'tenant-empty-resource-org') target = { ...resource, organizationId: '' };
          if (name === 'tenant-admin-unscoped-other-owner') target = { userId: 'other-user' };
          if (name === 'same-tenant-owner') { roles = [Role.VIEWER]; user = { userId: 'other-user', organizationId: 'tenant-a' }; expected = true; }
          if (name === 'same-tenant-admin') { user = { ...user, organizationId: 'tenant-a' }; expected = true; }
          if (name === 'super-admin-explicit-bypass') { roles = [Role.SUPER_ADMIN]; expected = true; }
          if (name === 'viewer-cannot-read-other-owner') { roles = [Role.VIEWER]; user = { ...user, organizationId: 'tenant-a' }; }
          observed = rbac.canAccessResource(roles, Permission.EVENT_READ, target, user);
          pass = observed === expected;
        } else if (name === 'token-pair') {
          const pair = await manager.generateTokenPair(payload);
          observed = await manager.verifyAccessToken(pair.accessToken);
          pass = observed.userId === payload.userId && observed.mfaVerified === true && pair.expiresIn === 900;
        } else if (name === 'empty-role-permission-arrays') {
          observed = await manager.verifyAccessToken(sign({ ...payload, roles: [], permissions: [] }));
          pass = observed.roles.length === 0 && observed.permissions.length === 0;
        } else if (name === 'refresh-projection') {
          const pair = await manager.generateTokenPair(payload);
          observed = await manager.verifyRefreshToken(pair.refreshToken);
          pass = JSON.stringify(observed) === JSON.stringify({ userId: payload.userId, sessionId: payload.sessionId });
        } else if (name === 'reject-hs384') {
          try { await manager.verifyAccessToken(sign(payload, 'access', true, 'HS384')); observed = 'accepted'; }
          catch { observed = 'rejected'; }
          pass = observed === 'rejected';
        }
      } catch (err) { error = String(err); }
      rows.push({ name, pass, observed, error, elapsed_ms: performance.now() - started });
    }
  } finally {
    if (app) { app.server.closeAllConnections(); await app.close(); }
    process.env = previous;
  }
  return rows;
}
module.exports = { contract, probeAuth };
if (require.main === module) probeAuth(process.argv[2] || process.cwd()).then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(e); process.exitCode = 1; });
