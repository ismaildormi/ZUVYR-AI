# Durable AI Job Starter

Run:

```bash
npm start
```

The example submits the same logical operation twice with the same idempotency key. Only one task is created and only one reservation is made. The worker then settles the actual cost.

Production systems should replace the in-memory maps with transactional persistence and a durable queue.
