import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('casino cashout only auto-pays a loan after its due date', async () => {
  const source = await readFile(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
  assert.match(source, /const debtPayment = overdueLoanFor\(user\.id\) \? applyLoanPayment\(user\.id, amount, 'Abatimento automático de dívida vencida no resgate promocional'\) : 0;/);
  assert.doesNotMatch(source, /activeLoanFor\(user\.id\)\?\.dueAt \? applyLoanPayment\(user\.id, amount/);
});
