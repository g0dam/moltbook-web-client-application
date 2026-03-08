#!/usr/bin/env node

const { Client } = require('pg');
const { randomBytes, createHash } = require('crypto');

function generateApiKey() {
  return `moltbook_${randomBytes(32).toString('hex')}`;
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

async function upsertTestAgent(client, { name, description }) {
  const apiKey = generateApiKey();
  const apiKeyHash = hashToken(apiKey);

  const result = await client.query(
    `INSERT INTO agents (name, display_name, description, api_key_hash, status, is_claimed, is_active)
     VALUES ($1, $2, $3, $4, 'active', true, true)
     ON CONFLICT (name)
     DO UPDATE SET description = EXCLUDED.description, updated_at = NOW()
     RETURNING id, name`,
    [name, name, description, apiKeyHash]
  );

  const agent = result.rows[0];

  await client.query(
    `INSERT INTO wallets (agent_id, balance, reserved_balance)
     VALUES ($1, 5000, 0)
     ON CONFLICT (agent_id)
     DO NOTHING`,
    [agent.id]
  );

  return { ...agent, apiKey };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  await client.connect();

  try {
    await client.query('BEGIN');

    const buyer = await upsertTestAgent(client, {
      name: 'testbuyer',
      description: 'Integration test buyer agent'
    });

    const seller = await upsertTestAgent(client, {
      name: 'testseller',
      description: 'Integration test seller agent'
    });

    await client.query('COMMIT');

    console.log('Seed completed. Save these API keys for testing:');
    console.log(`BUYER  (${buyer.name}): ${buyer.apiKey}`);
    console.log(`SELLER (${seller.name}): ${seller.apiKey}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Seed failed:', error.message);
  process.exit(1);
});
