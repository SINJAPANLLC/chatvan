---
name: db.execute pattern
description: node-pg アダプタで db.execute() の返り値を扱うパターン
---

# Drizzle ORM + node-postgres での db.execute() パターン

## ルール

drizzle-orm の `node-postgres` アダプタでは `db.execute(sql`...`)` は `QueryResult` オブジェクトを返す（配列ではない）。

**Wrong:**
```ts
const [row] = await db.execute(sql`SELECT ...`);  // Not iterable!
```

**Correct (raw SQL が必要な場合):**
```ts
const raw = await db.execute(sql`SELECT ...`);
const row = (raw as any).rows?.[0] ?? (raw as any)[0];
const rows = (raw as any).rows ?? (raw as any);
```

**Best: Drizzle ORM を使う:**
```ts
const [row] = await db.select().from(myTable).where(...).limit(1);
const [inserted] = await db.insert(myTable).values({...}).returning();
```

## Why

auth.ts にも `(rows as any).rows?.[0] ?? (rows as any)[0]` パターンがある。
node-pg の QueryResult は `{ rows: [...], rowCount: n, ... }` 構造。

## How to apply

新規ルートは Drizzle ORM で書く。JOIN が複雑で raw SQL が必要な場合は `toRows(raw)` / `toRow(raw)` ヘルパーを使う（van-extras.ts に実装済み）。
