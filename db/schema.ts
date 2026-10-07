import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const games = sqliteTable("games", {
  id: text("id").primaryKey(),
  adminHash: text("admin_hash").notNull(),
  pinHash: text("pin_hash").notNull(),
  state: text("state").notNull(),
  revision: integer("revision").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});
