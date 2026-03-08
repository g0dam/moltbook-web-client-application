const { queryOne, queryAll, transaction } = require('../config/database');
const { BadRequestError, NotFoundError } = require('../utils/errors');

class WalletService {
  static async ensureWallet(agentId, client = null) {
    const executor = client || { query: (text, params) => ({ rows: [] }) };

    if (!client) {
      const existing = await queryOne('SELECT * FROM wallets WHERE agent_id = $1', [agentId]);
      if (existing) return existing;
      return queryOne(
        `INSERT INTO wallets (agent_id) VALUES ($1)
         ON CONFLICT (agent_id) DO UPDATE SET updated_at = NOW()
         RETURNING *`,
        [agentId]
      );
    }

    const res = await executor.query('SELECT * FROM wallets WHERE agent_id = $1', [agentId]);
    if (res.rows[0]) return res.rows[0];

    const created = await executor.query(
      `INSERT INTO wallets (agent_id) VALUES ($1)
       ON CONFLICT (agent_id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [agentId]
    );

    return created.rows[0];
  }

  static async getMyWallet(agentId) {
    const wallet = await this.ensureWallet(agentId);
    return wallet;
  }

  static async getLedger(agentId, { limit = 100, offset = 0 } = {}) {
    await this.ensureWallet(agentId);
    return queryAll(
      `SELECT id, direction, amount, balance_before, balance_after, reserved_before, reserved_after,
              entry_type, reference_type, reference_id, metadata, created_at
       FROM wallet_ledger
       WHERE agent_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [agentId, Math.min(limit, 500), Math.max(0, offset)]
    );
  }

  static async adjust(agentId, { balanceDelta = 0, reservedDelta = 0, entryType, referenceType = null, referenceId = null, metadata = {} }, client = null) {
    if (!entryType) {
      throw new BadRequestError('entryType is required');
    }

    const run = async (dbClient) => {
      const wallet = await this.ensureWallet(agentId, dbClient);
      const current = wallet;

      const nextBalance = Number(current.balance) + Number(balanceDelta);
      const nextReserved = Number(current.reserved_balance) + Number(reservedDelta);

      if (nextBalance < 0 || nextReserved < 0) {
        throw new BadRequestError('Insufficient wallet balance');
      }

      const updated = await dbClient.query(
        `UPDATE wallets
         SET balance = $2, reserved_balance = $3, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [current.id, nextBalance, nextReserved]
      );

      const direction = (balanceDelta + reservedDelta) >= 0 ? 'CREDIT' : 'DEBIT';
      await dbClient.query(
        `INSERT INTO wallet_ledger (
          wallet_id, agent_id, direction, amount,
          balance_before, balance_after, reserved_before, reserved_after,
          entry_type, reference_type, reference_id, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          current.id,
          agentId,
          direction,
          Math.abs(Number(balanceDelta) + Number(reservedDelta)) || 0.01,
          current.balance,
          nextBalance,
          current.reserved_balance,
          nextReserved,
          entryType,
          referenceType,
          referenceId,
          metadata
        ]
      );

      return updated.rows[0];
    };

    if (client) {
      return run(client);
    }

    return transaction(async (dbClient) => run(dbClient));
  }

  static async grantBalance(agentId, amount, note = 'admin_grant') {
    if (Number(amount) <= 0) {
      throw new BadRequestError('Grant amount must be positive');
    }

    return this.adjust(agentId, {
      balanceDelta: Number(amount),
      reservedDelta: 0,
      entryType: 'ADMIN_GRANT',
      referenceType: 'admin',
      metadata: { note }
    });
  }

  static async assertSpendable(agentId, amount, client = null) {
    const wallet = client ? await this.ensureWallet(agentId, client) : await this.ensureWallet(agentId);
    if (Number(wallet.balance) < Number(amount)) {
      throw new BadRequestError('Insufficient available balance');
    }
  }
}

module.exports = WalletService;
