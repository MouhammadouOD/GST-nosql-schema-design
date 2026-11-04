# Refactored design — analytics + high availability

## New requirements

- **Analytics:** large-scale analytical queries over product trends and sales data.
- **High availability:** the application must tolerate node failure and partition without going down, given growing user numbers.

## Strategy 1 — Replication (addresses high availability)

Every shard (see below) runs as a 3-node replica set: one primary, two secondaries. Writes go to the primary; the two secondaries replicate asynchronously and can be promoted automatically if the primary fails, so a single node failure does not take the database down. This directly satisfies the availability/partition-tolerance requirement without touching the schema itself — it is an infrastructure-layer change.

**Trade-off:** secondary reads are eventually consistent (replication lag, typically milliseconds). This is acceptable for product browsing and analytics, but order-status reads that must reflect the absolute latest write still go to the primary.

## Strategy 2 — Sharding (addresses the throughput + availability requirement together)

- `orders` is sharded on a **hashed `_id`**. A hashed key (rather than `userId` or `createdAt`) was chosen specifically to avoid two realistic hotspots: sharding by `createdAt` would funnel all of "right now's" writes onto a single shard (every new order has a recent timestamp), and sharding by `userId` would overload the shard holding any unusually active customer or bot account. A hashed `_id` distributes write load evenly across shards regardless of traffic pattern, which is what "thousands of transactions per second" actually requires.
- `products` is sharded on `category`, since browsing and search queries are almost always scoped to a category, so this keeps most reads targeted to a single shard instead of fanning out to all of them (a "scatter-gather" query, which is the thing sharding is otherwise at risk of making slower, not faster).

**Trade-off:** a hashed shard key on `orders` means "all of a customer's orders" is no longer a single-shard query — the application-level fix is to keep the `userId` index (already present in the initial design) and rely on the query router to scatter-gather across shards for that one query pattern, accepting that this specific query is less optimal in exchange for even write distribution on the much higher-volume write path.

## Strategy 3 — Denormalization for analytics (new collection: `salesSummary`)

Running analytical aggregations (totals by product, by day) directly against the live `orders` collection would mean every analytics query competes with the live checkout/payment write path for the same shards — exactly what must be avoided given the new availability requirement. Instead:

```json
{
  "_id": "sum_2026-03-02_prd_3321",
  "date": "2026-03-02",
  "productId": "prd_3321",
  "category": "electronics/accessories",
  "unitsSold": 37,
  "revenue": 2959.63
}
```

`salesSummary` is a pre-aggregated, denormalized collection, populated by a background job (driven by MongoDB change streams on `orders`, or a scheduled batch aggregation) rather than computed at query time. Analytical dashboards query this collection — small, read-optimized, and indexed by `date` + `category` — instead of scanning millions of raw order documents.

**Trade-off — the core consistency/availability/performance trade-off of this refactor:** `salesSummary` is eventually consistent; it lags the real-time `orders` collection by however long the aggregation job takes to run (seconds to minutes, depending on whether it's streamed or batched). This is the right trade to make: analytics dashboards do not need up-to-the-millisecond accuracy, but they do need to never compete for capacity with a customer trying to complete a purchase. Sacrificing a small, bounded amount of analytics freshness in exchange for isolating analytical load from transactional load is a deliberate application of the CAP-theorem trade-off the new requirements explicitly ask for ("favor availability and partition tolerance").

## Summary of what changed and why

| Concern | v1 (initial) | v2 (refactored) | Reason |
|---|---|---|---|
| Node failure | Single node per shard | 3-node replica set per shard | High availability requirement |
| Write throughput | Unsharded collections | Hashed-shard `orders`, category-sharded `products` | Thousands of tx/sec, avoid hotspots |
| Analytics queries | Would scan `orders` directly | Pre-aggregated `salesSummary` | Isolate analytical load from transactional load |
| Consistency | Strongly consistent reads (single node) | Strong on primary, eventual on secondaries/analytics | Required to gain availability and analytics performance |
