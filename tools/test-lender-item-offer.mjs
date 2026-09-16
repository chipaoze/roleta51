import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const src = await readFile(new URL('../legacy-server.mjs', import.meta.url), 'utf8');
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const purchase = { id: 'purchase-1', userId: 'davi', itemId: 'cursor-test', createdAt: new Date().toISOString() };
const db = { settings: {}, users: [{ id: 'davi', active: true }], submissions: [], economy: { loans: [], purchases: [purchase], equipped: { davi: { cursorStyle: 'cursor-test' } }, creditAdjustments: [] } };
let wallet = 100, response;
const ctx = vm.createContext({ db, user: db.users[0], HttpError, Date, randomUUID: () => 'adjustment-1', SHOP_CATALOG: [{ id: 'cursor-test', name: 'Cursor de teste', icon: '🖱️', type: 'cursorStyle', price: 300 }], walletFor: () => wallet, addCredits: (_, amount) => { wallet += amount; }, requireAuth: () => ({ user: db.users[0] }), readJson: async () => ({ purchaseId: 'purchase-1' }), persist: async () => {}, broadcastRefresh() {}, json: (_, status, value) => { response = { status, value }; }, stateFor: () => ({}), res: {}, req: { method: 'POST' }, route: '/api/loans/offer-item' });
vm.runInContext(src.slice(src.indexOf('function activeLoanFor('), src.indexOf('function eligibleUsers(')), ctx);
const handler = vm.runInContext('(async()=>{' + src.slice(src.indexOf("  if (req.method === 'POST' && route === '/api/loans/offer-item')"), src.indexOf("  if (req.method === 'POST' && route === '/api/loans/borrow')")) + '})', ctx);
await handler();
assert.equal(response.status, 200); assert.equal(wallet, 280); assert.equal(db.economy.purchases.length, 0); assert.equal(db.economy.equipped.davi.cursorStyle, null);
console.log('PASS: oferta local do Agiota remove item equipado e credita 180 créditos para Davi.');

