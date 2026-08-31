import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const appState = sqliteTable('app_state', {
  id: integer('id').primaryKey(),
  data: text('data').notNull(),
  revision: integer('revision').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
});
