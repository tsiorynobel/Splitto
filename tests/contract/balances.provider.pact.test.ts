import { describe, it, beforeAll, afterAll } from 'vitest';
import { Verifier } from '@pact-foundation/pact';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { createApp } from '../../src/server';

const __dirname = dirname(fileURLToPath(import.meta.url));

let container: StartedPostgreSqlContainer;
let pool: Pool;
let server: http.Server;
let serverPort: number;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  pool = new Pool({ connectionString: container.getConnectionUri() });

  const migration = readFileSync(
    join(__dirname, '../../migrations/001-initial.sql'),
    'utf8',
  );
  await pool.query(migration);

  const app = createApp(pool);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  serverPort = (server.address() as { port: number }).port;
}, 90_000);

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  await pool.end();
  await container.stop();
});

describe('Pact provider verification — splitto-api', () => {
  it('vérifie le contrat Pact généré par le consumer', async () => {
    const pactFilePath = join(
      __dirname,
      '../../pacts/splitto-frontend-splitto-api.json',
    );

    await new Verifier({
      provider: 'splitto-api',
      providerBaseUrl: `http://localhost:${serverPort}`,
      pactUrls: [pactFilePath],
      logLevel: 'error',

      stateHandlers: {
        'group-1 a 3 membres et 2 dépenses': async () => {
          await pool.query('TRUNCATE groups CASCADE');

          await pool.query(
            `INSERT INTO groups (id, name, currency) VALUES ('group-1', 'Vacances', 'EUR')`,
          );

          await pool.query(
            `INSERT INTO members (id, group_id, name, email) VALUES
              ('member-1', 'group-1', 'Alice',   'alice@test.com'),
              ('member-2', 'group-1', 'Bob',     'bob@test.com'),
              ('member-3', 'group-1', 'Charlie', 'charlie@test.com')`,
          );

          await pool.query(
            `INSERT INTO expenses
               (id, group_id, description, amount, currency, paid_by, paid_at, split_mode, split_data)
             VALUES
               ('exp-1', 'group-1', 'Restaurant', 60.00, 'EUR', 'member-1',
                NOW() - INTERVAL '2 days', 'equal',
                '{"mode":"equal","beneficiaries":["member-1","member-2","member-3"]}'),
               ('exp-2', 'group-1', 'Transport',  30.00, 'EUR', 'member-2',
                NOW() - INTERVAL '1 day', 'equal',
                '{"mode":"equal","beneficiaries":["member-1","member-2","member-3"]}')`,
          );
        },

        'aucun groupe inexistant': async () => {
          await pool.query('TRUNCATE groups CASCADE');
        },
      },
    }).verifyProvider();
  }, 90_000);
});
