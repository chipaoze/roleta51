// Generates commands only from explicit, known reward identifiers. Never writes
// to the delivery record or changes its state.
const STONES = Object.freeze({
  'fire-stone': 4, 'water-stone': 4, 'thunder-stone': 4, 'leaf-stone': 4,
  'ice-stone': 3, 'sun-stone': 3, 'moon-stone': 3,
  'dawn-stone': 2, 'dusk-stone': 2, 'shiny-stone': 1,
});

export function buildCobblemonDeliveryCommand(entry, playerName, catalog = {}) {
  if (!entry || entry.status !== 'awaiting-delivery') return { error: 'A entrega não está pendente.' };
  if (!/^[A-Za-z0-9_]{1,16}$/.test(String(playerName || ''))) return { error: 'Cadastre um nick válido do Minecraft para este jogador.' };
  if (entry.boxId === 'pokemon') {
    const pokemon = catalog.pokemonById?.[entry.pokemonId];
    const species = pokemon?.commandId;
    const level = Number(entry.level);
    if (!/^[a-z0-9_]+(?::[a-z0-9_]+)?$/.test(String(species || '')) || !Number.isInteger(level) || level < 1 || level > 100 || typeof entry.isShiny !== 'boolean') return { error: 'Dados do Pokémon incompletos; confira a entrega manualmente.' };
    const gender = String(entry.gender || '').toLowerCase();
    if (gender && !['male', 'female', 'genderless'].includes(gender)) return { error: 'Gênero não reconhecido; confira a entrega manualmente.' };
    return { command: `/givepokemonother ${playerName} ${species} level=${level} shiny=${entry.isShiny}${gender ? ` gender=${gender}` : ''}` };
  }
  if (entry.boxId === 'evolution' && Object.hasOwn(STONES, entry.rewardId)) {
    const itemId = catalog.stoneItemIds?.[entry.rewardId];
    if (!/^cobblemon:[a-z0-9_]+$/.test(String(itemId || ''))) return { error: 'ID desta pedra ainda precisa ser confirmado no servidor.' };
    return { command: `/give ${playerName} ${itemId} ${STONES[entry.rewardId]}` };
  }
  const reward = catalog.rewards?.[`${entry.boxId}:${entry.rewardId}`];
  if (!reward || !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(String(reward.itemId || '')) || !Number.isInteger(reward.quantity) || reward.quantity < 1 || reward.quantity > 64 || reward.special) return { error: 'Prêmio especial ou não identificado; confira a entrega manualmente.' };
  let components = '';
  if (reward.damage !== undefined) {
    if (!Number.isInteger(reward.damage) || reward.damage < 0 || reward.damage > 4 || reward.enchantments) return { error: 'Dados do item inválidos; confira a entrega manualmente.' };
    components = `[minecraft:damage=${reward.damage}]`;
  }
  if (reward.enchantments) {
    const entries = Object.entries(reward.enchantments);
    if (!entries.length || entries.some(([id, level]) => !/^[a-z_]+$/.test(id) || !Number.isInteger(level) || level < 1 || level > 255)) return { error: 'Encantamentos inválidos; confira a entrega manualmente.' };
    components = `[minecraft:enchantments={levels:{${entries.map(([id, level]) => `"minecraft:${id}":${level}`).join(',')}}}]`;
  }
  return { command: `/give ${playerName} ${reward.itemId}${components} ${reward.quantity}` };
}
