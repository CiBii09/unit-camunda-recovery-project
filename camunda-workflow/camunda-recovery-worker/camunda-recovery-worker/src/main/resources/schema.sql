CREATE TABLE IF NOT EXISTS worker_idempotency (
    idempotency_key VARCHAR(255) PRIMARY KEY,
    status VARCHAR(16) NOT NULL,
    claim_token VARCHAR(36),
    lease_until TIMESTAMP NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
