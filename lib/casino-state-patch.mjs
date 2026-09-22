// A jogada altera poucos campos. Atualizá-los dentro do D1 evita serializar
// todo o estado do portal em cada aposta no Worker gratuito.
export function casinoPlayStatePatch({ userId, play, account, wallet, adjustment, inventoryItem, revision, updatedAt }) {
  const userKey = JSON.stringify(String(userId));
  const values = [];
  const changes = [];
  const addJson = (path, value) => {
    changes.push('?, json(?)');
    values.push(path, JSON.stringify(value));
  };
  addJson('$.economy.casinoPlays[#]', play);
  addJson(`$.economy.casinoAccounts.${userKey}`, account);
  if (wallet !== undefined) {
    changes.push('?, ?');
    values.push(`$.economy.wallets.${userKey}`, wallet);
  }
  if (adjustment) addJson('$.economy.creditAdjustments[#]', adjustment);
  if (inventoryItem) addJson('$.economy.mysteryBoxes[#]', inventoryItem);
  const sql = `UPDATE app_state SET data = json_set(data, ${changes.join(', ')}), revision = ?, updated_at = ? WHERE id = 1 AND revision = ?`;
  return { sql, values: [...values, revision + 1, updatedAt, revision] };
}
