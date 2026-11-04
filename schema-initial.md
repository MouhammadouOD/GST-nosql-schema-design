# Initial design — NoSQL schema for an e-commerce app

## Requirements recap

- Users browse and search products.
- Orders store customer info, purchased items, and delivery status.
- The system must support thousands of transactions per second.

## Model choice: document store (MongoDB-style)

A document model fits this domain better than key-value or wide-column for one concrete reason: both products and orders are naturally tree-shaped (a product has tags, an order has a list of line items and a nested delivery address), and a document database lets each of those live as one self-contained document instead of being split across several tables joined at query time. For an e-commerce app specifically, that matters because the two hottest read paths — "show me this product" and "show me this order" — both resolve to a single document fetch rather than a join, which is exactly what needs to stay fast under load.

A pure key-value store was rejected because product search needs richer querying (by category, tag, free text) than a key-value store's "fetch by key" model supports. A wide-column store (Cassandra-style) was considered for the orders collection specifically, given the "thousands of transactions per second" requirement, but was not chosen for v1 because the team's existing MongoDB/Mongoose experience (from earlier bootcamp modules) reduces implementation risk, and MongoDB's horizontal write scaling via sharding (see `schema-refactored.md`) covers the same throughput requirement without introducing a second database technology to operate.

## Entities and collections

### `users`

```json
{
  "_id": "usr_8841",
  "name": "Amadou Diallo",
  "email": "amadou.diallo@example.com",
  "addresses": [{ "label": "home", "line1": "12 Rue de la Paix", "city": "Dakar", "country": "SN" }],
  "createdAt": "2026-02-10T09:15:00Z"
}
```

Addresses are embedded rather than a separate collection: a user typically has one to a handful of addresses, they are always read together with the user (checkout, profile page), and they never need to be queried independently of their owner — the textbook case for embedding over referencing.

### `products`

```json
{
  "_id": "prd_3321",
  "name": "Wireless Mechanical Keyboard",
  "description": "Compact 75% layout, hot-swappable switches, USB-C.",
  "category": "electronics/accessories",
  "price": 79.99,
  "tags": ["keyboard", "wireless", "mechanical", "usb-c"],
  "stockCount": 142
}
```

**Indexes:**
- A compound index on `category` (for category browsing).
- A text index on `name`, `description`, and `tags` (for the "search for products" requirement) — this is the concrete reason a document store with native text-index support was preferred over a key-value store, which has no query capability beyond key lookup.

### `orders`

```json
{
  "_id": "ord_559201",
  "userId": "usr_8841",
  "items": [
    { "productId": "prd_3321", "name": "Wireless Mechanical Keyboard", "price": 79.99, "quantity": 1 }
  ],
  "status": "paid",
  "createdAt": "2026-03-02T14:22:10Z",
  "deliveryAddress": { "line1": "12 Rue de la Paix", "city": "Dakar", "country": "SN" }
}
```

**Indexes:**
- `userId` (a customer's order history is a very common query).
- `status` (operational dashboards filter by order status).
- `createdAt` (recent-orders views, and it doubles as the shard-key candidate discussed in the refactor).

**Design decision — embedding line items, not referencing them:** each order embeds a denormalized snapshot of `name` and `price` for every item, rather than only storing a `productId` and joining against `products` at read time. This is deliberate: product prices and names change over time, but an order must preserve what the customer actually paid and bought *at the moment of purchase*. Looking this up live from the current `products` collection would silently show the wrong historical price. It also means an order is a single self-contained document — one write, no cross-document transaction needed to record a purchase, which directly supports the "thousands of transactions per second" requirement, since a single-document write is the cheapest and most consistent operation a document database offers.

## Consistency and scalability notes (v1)

- Orders are written as a single atomic document, so an order is never readable in a partially-written state — important for the "ensure consistency in customer order status" requirement.
- Product reads (browsing, search) are the highest-volume, least consistency-sensitive operation in the system, and are architecturally separated from the write-heavy `orders` collection so that scaling one does not require scaling the other identically — this separation is exactly what gets exploited in the refactor.
