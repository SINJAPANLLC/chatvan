import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const blogPostsTable = pgTable("blog_posts", {
  id:              serial("id").primaryKey(),
  slug:            text("slug").notNull().unique(),
  title:           text("title").notNull(),
  excerpt:         text("excerpt").notNull(),
  content:         text("content").notNull(),
  category:        text("category").notNull().default("物流コラム"),
  tags:            text("tags"),           // JSON配列文字列
  metaTitle:       text("meta_title"),
  metaDescription: text("meta_description"),
  /** 公開/非公開 */
  published:       boolean("published").notNull().default(false),
  publishedAt:     timestamp("published_at"),
  createdAt:       timestamp("created_at").defaultNow().notNull(),
  updatedAt:       timestamp("updated_at").defaultNow().notNull(),
});

export type BlogPost = typeof blogPostsTable.$inferSelect;
