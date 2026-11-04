# NoSQL Schema Design — E-Commerce

GoMyCode checkpoint — *Designing NoSQL databases based on multiple requirement views* (Master Degree Highlights).

A document-model (MongoDB-style) schema design for an e-commerce application, first designed against the initial requirements, then refactored to meet new analytics and high-availability requirements.

- [`schema-initial.md`](schema-initial.md) — Part 1: entities, collections, indexes, and the reasoning behind embedding vs. referencing.
- [`schema-refactored.md`](schema-refactored.md) — Part 2: sharding, replication, and denormalization added to meet the new analytics + high-availability requirements, with the consistency/availability/performance trade-offs made explicit.
- [`REFLECTION.md`](REFLECTION.md) — short reflection (200–300 words).

## Why this isn't just prose

Each collection has a real [JSON Schema](https://json-schema.org/) definition in `schemas/`, a matching example document in `examples/`, and a test suite (`test/validate.test.js`, using [Ajv](https://ajv.js.org/)) that validates every example against its schema — plus negative tests that confirm each schema actually *rejects* malformed documents (an order with no items, a negative price, a malformed email, etc.), not just accepts whatever is thrown at it.

```bash
npm install
npm test   # 10/10: 4 positive (examples are valid) + 6 negative (invalid docs are rejected)
```

This was checked against a deliberately broken schema before being trusted: removing the `minimum: 0` constraint from `product.schema.json` was confirmed to make the corresponding negative test fail, then reverted. See the commit history / `REFLECTION.md` for the bug this approach actually caught during development.
