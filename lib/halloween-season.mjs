const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';

export const HALLOWEEN_2026 = Object.freeze({
  id: 'halloween-2026',
  label: 'Halloween da Área 51',
  startsOn: '2026-09-25',
  endsOn: '2026-11-01',
  startsAt: '2026-09-25T00:00:00-03:00',
  endsAt: '2026-11-01T00:00:00-03:00',
});

export function saoPauloDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function halloween2026State(date = new Date()) {
  const day = saoPauloDateKey(date);
  if (day < HALLOWEEN_2026.startsOn || day >= HALLOWEEN_2026.endsOn) return null;
  return { ...HALLOWEEN_2026, active: true };
}

// Itens já adquiridos nunca dependem desta verificação: ela existe somente
// para impedir compra, presente e prêmio aleatório fora da janela do evento.
export function isSeasonalShopItemAvailable(item, date = new Date()) {
  if (!item?.seasonalEvent) return true;
  return item.seasonalEvent === HALLOWEEN_2026.id && Boolean(halloween2026State(date));
}
