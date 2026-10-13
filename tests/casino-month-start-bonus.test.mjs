import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const server = await readFile(new URL('../legacy-server.mjs', import.meta.url), 'utf8');

test('bônus de início do mês é único, alcança contas já abertas e volta à regra diária no dia seguinte', () => {
  assert.match(server, /const CASINO_MONTH_START_BONUS_DAY = '2026-10-01';/);
  assert.match(server, /const CASINO_MONTH_START_BONUS = 500;/);
  assert.match(server, /const CASINO_MONTH_START_CASHOUT_THRESHOLD = 1000;/);
  assert.match(server, /casinoMonthStartBonusV1/);
  assert.match(server, /CASINO_MONTH_START_BONUS - CASINO_DAILY_BONUS/);
  assert.match(server, /balance: CASINO_MONTH_START_BONUS/);
  assert.match(server, /account\.cashedOut = false;/);
  assert.match(server, /casinoMonthStartBonusFloorV2/);
  assert.match(server, /account\.balance = CASINO_MONTH_START_BONUS;/);
  assert.match(server, /casinoCashoutThresholdForDay\(account\.dayKey\)/);
  assert.match(server, /title: '🍬 Gostosuras ou Travessuras'/);
});
