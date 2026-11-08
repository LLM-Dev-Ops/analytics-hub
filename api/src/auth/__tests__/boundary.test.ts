import { resolve } from 'path';

const { contract, probeAuth } = require('../../../security/probe-auth.cjs');
const root = resolve(__dirname, '../../..');

describe('native JWT and tenant authorization boundary', () => {
  for (const name of [...contract.holdout, ...contract.anchor]) {
    it(name, async () => {
      const [result] = await probeAuth(root, [name]);
      expect(result.error).toBeUndefined();
      expect(result.pass).toBe(true);
    });
  }
});
