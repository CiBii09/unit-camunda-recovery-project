package com.unit.worker;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

@Repository
public class IdempotencyStore {

    private static final Duration CLAIM_LEASE = Duration.ofMinutes(15);

    private final JdbcTemplate jdbcTemplate;

    public IdempotencyStore(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public ClaimResult claim(String idempotencyKey, String claimToken) {
        for (int attempt = 0; attempt < 3; attempt++) {
            Instant now = Instant.now();
            try {
                jdbcTemplate.update(
                        "INSERT INTO worker_idempotency "
                                + "(idempotency_key, status, claim_token, lease_until, updated_at) "
                                + "VALUES (?, 'PROCESSING', ?, ?, CURRENT_TIMESTAMP)",
                        idempotencyKey,
                        claimToken,
                        Timestamp.from(now.plus(CLAIM_LEASE)));
                return ClaimResult.CLAIMED;
            } catch (DuplicateKeyException ignored) {
                List<IdempotencyRecord> records = jdbcTemplate.query(
                        "SELECT status, lease_until FROM worker_idempotency WHERE idempotency_key = ?",
                        (resultSet, rowNumber) -> new IdempotencyRecord(
                                resultSet.getString("status"),
                                resultSet.getTimestamp("lease_until") == null
                                        ? null
                                        : resultSet.getTimestamp("lease_until").toInstant()),
                        idempotencyKey);

                if (records.isEmpty()) {
                    continue;
                }

                IdempotencyRecord record = records.get(0);
                if ("COMPLETED".equals(record.status())) {
                    return ClaimResult.COMPLETED;
                }
                if (record.leaseUntil() == null || record.leaseUntil().isAfter(now)) {
                    return ClaimResult.IN_PROGRESS;
                }

                int claimed = jdbcTemplate.update(
                        "UPDATE worker_idempotency "
                                + "SET claim_token = ?, lease_until = ?, updated_at = CURRENT_TIMESTAMP "
                                + "WHERE idempotency_key = ? AND status = 'PROCESSING' AND lease_until <= ?",
                        claimToken,
                        Timestamp.from(now.plus(CLAIM_LEASE)),
                        idempotencyKey,
                        Timestamp.from(now));
                if (claimed == 1) {
                    return ClaimResult.CLAIMED;
                }
            }
        }
        return ClaimResult.IN_PROGRESS;
    }

    public void markCompleted(String idempotencyKey, String claimToken) {
        int updated = jdbcTemplate.update(
                "UPDATE worker_idempotency "
                        + "SET status = 'COMPLETED', claim_token = NULL, lease_until = NULL, "
                        + "updated_at = CURRENT_TIMESTAMP "
                        + "WHERE idempotency_key = ? AND status = 'PROCESSING' AND claim_token = ?",
                idempotencyKey,
                claimToken);
        if (updated != 1) {
            throw new IllegalStateException("Idempotency claim was lost before completion");
        }
    }

    public void release(String idempotencyKey, String claimToken) {
        jdbcTemplate.update(
                "DELETE FROM worker_idempotency "
                        + "WHERE idempotency_key = ? AND status = 'PROCESSING' AND claim_token = ?",
                idempotencyKey,
                claimToken);
    }

    public enum ClaimResult {
        CLAIMED,
        COMPLETED,
        IN_PROGRESS
    }

    private record IdempotencyRecord(String status, Instant leaseUntil) {
    }
}
