import { describe, it, expect } from 'vitest';
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { like, eachLike, regex } = MatchersV3;

const provider = new PactV3({
  consumer: 'splitto-frontend',
  provider: 'splitto-api',
  dir: join(__dirname, '../../pacts'),
  logLevel: 'error',
});

describe('Contrat Pact — Consumer : GET /api/groups/:id/balances', () => {
  it('retourne 200 avec balances et settlements pour un groupe existant', async () => {
    await provider
      .addInteraction({
        states: [{ description: 'group-1 a 3 membres et 2 dépenses' }],
        uponReceiving: 'une requête GET /api/groups/group-1/balances',
        withRequest: {
          method: 'GET',
          path: '/api/groups/group-1/balances',
        },
        willRespondWith: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            groupId: regex('[a-z0-9-]+', 'group-1'),
            balances: like({
              'member-1': 20.0,
              'member-2': -10.0,
              'member-3': -10.0,
            }),
            settlements: eachLike({
              from: regex('[a-z0-9-]+', 'member-2'),
              to: regex('[a-z0-9-]+', 'member-1'),
              amount: like(10.0),
            }),
          },
        },
      })
      .executeTest(async (mockServer) => {
        const response = await fetch(
          `${mockServer.url}/api/groups/group-1/balances`,
        );

        expect(response.status).toBe(200);

        const data = (await response.json()) as {
          groupId: string;
          balances: Record<string, number>;
          settlements: Array<{ from: string; to: string; amount: number }>;
        };

        expect(data.groupId).toBeDefined();
        expect(data.balances).toBeDefined();
        expect(typeof data.balances).toBe('object');
        expect(data.settlements).toBeInstanceOf(Array);
      });
  });

  it('retourne 404 quand le groupe n\'existe pas', async () => {
    await provider
      .addInteraction({
        states: [{ description: 'aucun groupe inexistant' }],
        uponReceiving: 'une requête GET /api/groups/inexistant/balances',
        withRequest: {
          method: 'GET',
          path: '/api/groups/inexistant/balances',
        },
        willRespondWith: {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
          body: {
            error: like('Group not found'),
          },
        },
      })
      .executeTest(async (mockServer) => {
        const response = await fetch(
          `${mockServer.url}/api/groups/inexistant/balances`,
        );

        expect(response.status).toBe(404);

        const data = (await response.json()) as { error: string };
        expect(data.error).toBeDefined();
      });
  });
});
