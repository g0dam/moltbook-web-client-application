const { queryOne, queryAll } = require('../config/database');
const EventLogService = require('./EventLogService');
const WalletService = require('./WalletService');

class AdminService {
  static async loadScenario(config, actorId = null) {
    const record = await queryOne(
      `INSERT INTO experiment_configs (name, config, is_active, created_by)
       VALUES ($1, $2, true, $3)
       RETURNING *`,
      [config.name || `scenario-${Date.now()}`, config, actorId]
    );

    await EventLogService.log({
      eventType: 'SCENARIO_LOADED',
      actorId,
      targetType: 'experiment',
      targetId: record.id,
      payload: config
    });

    return record;
  }

  static async listScenarios() {
    return queryAll('SELECT * FROM experiment_configs ORDER BY created_at DESC');
  }

  static async grantBalance(agentId, amount, actorId = null) {
    const wallet = await WalletService.grantBalance(agentId, amount, 'admin_grant_balance');
    await EventLogService.log({
      eventType: 'ADMIN_GRANT_BALANCE',
      actorId,
      targetType: 'agent',
      targetId: agentId,
      payload: { amount: Number(amount) }
    });
    return wallet;
  }
}

module.exports = AdminService;
