package com.unit.worker;

import io.camunda.zeebe.client.api.response.ActivatedJob;
import io.camunda.zeebe.client.api.worker.JobClient;
import lombok.extern.slf4j.Slf4j;

import java.time.Duration;
import java.util.UUID;

@Slf4j
public abstract class BaseIdempotentWorker {

    private final IdempotencyStore idempotencyStore;
    private final WorkerRetryPolicy retryPolicy;

    protected BaseIdempotentWorker(
            IdempotencyStore idempotencyStore, WorkerRetryPolicy retryPolicy) {
        this.idempotencyStore = idempotencyStore;
        this.retryPolicy = retryPolicy;
    }

    public final void handleJob(JobClient client, ActivatedJob job) {
        long jobKey = job.getKey();
        String idempotencyKey;
        String claimToken = UUID.randomUUID().toString();

        try {
            idempotencyKey = getIdempotencyKey(job);
            if (idempotencyKey == null || idempotencyKey.isBlank() || idempotencyKey.length() > 255) {
                throw new IllegalArgumentException("Idempotency key must contain 1 to 255 characters");
            }

            IdempotencyStore.ClaimResult claim = idempotencyStore.claim(idempotencyKey, claimToken);
            if (claim == IdempotencyStore.ClaimResult.COMPLETED) {
                log.info("Bỏ qua Job đã xử lý [JobKey: {}, IdempotencyKey: {}]", jobKey, idempotencyKey);
                completeJob(client, jobKey);
                return;
            }
            if (claim == IdempotencyStore.ClaimResult.IN_PROGRESS) {
                log.info("Job cùng IdempotencyKey đang được xử lý [JobKey: {}, IdempotencyKey: {}]",
                        jobKey, idempotencyKey);
                failJob(client, job, "An operation with this idempotency key is already in progress");
                return;
            }
        } catch (Exception e) {
            log.error("Không thể nhận quyền xử lý Job [JobKey: {}]", jobKey, e);
            failJob(client, job, e.getMessage());
            return;
        }

        try {
            executeBusinessLogic(client, job, idempotencyKey);
        } catch (SafeToRetryException e) {
            log.error("Có thể retry an toàn trước khi xác nhận Job [JobKey: {}, IdempotencyKey: {}]",
                    jobKey, idempotencyKey, e);
            try {
                idempotencyStore.release(idempotencyKey, claimToken);
            } catch (Exception releaseError) {
                log.error("Không thể nhả claim idempotency trước retry "
                        + "[JobKey: {}, IdempotencyKey: {}]", jobKey, idempotencyKey, releaseError);
            }
            failJob(client, job, e.getMessage());
            return;
        } catch (Exception e) {
            log.error("Lỗi nghiệp vụ khi xử lý Job [JobKey: {}, IdempotencyKey: {}]",
                    jobKey, idempotencyKey, e);
            failJob(client, job, e.getMessage());
            return;
        }

        try {
            idempotencyStore.markCompleted(idempotencyKey, claimToken);
        } catch (Exception e) {
            log.error("Nghiệp vụ đã chạy nhưng không lưu được trạng thái idempotency "
                    + "[JobKey: {}, IdempotencyKey: {}]", jobKey, idempotencyKey, e);
            failJob(client, job, e.getMessage());
            return;
        }

        completeJob(client, jobKey);
    }

    protected String getIdempotencyKey(ActivatedJob job) {
        return job.getType() + ":" + job.getKey();
    }

    private void completeJob(JobClient client, long jobKey) {
        try {
            client.newCompleteCommand(jobKey).send().join();
            log.info("Hoàn thành Job [JobKey: {}]", jobKey);
        } catch (Exception e) {
            log.error("Không thể gửi lệnh Complete tới Zeebe [JobKey: {}]. Job sẽ được xử lý lại an toàn.",
                    jobKey, e);
        }
    }

    private void failJob(JobClient client, ActivatedJob job, String message) {
        int retries = retryPolicy.retriesAfterFailure(job.getRetries());
        Duration backoff = retryPolicy.backoffFor(job.getRetries());
        String errorMessage = message == null ? "Worker could not process the job" : message;

        if (retries == 0) {
            log.error("Retry limit reached; sending job with 0 retries so Zeebe can create an incident "
                            + "[JobKey: {}, Type: {}, Error: {}]",
                    job.getKey(), job.getType(), errorMessage);
        } else {
            log.warn("Failing Job with retries remaining [JobKey: {}, Type: {}, Retries: {}, Backoff: {}]",
                    job.getKey(), job.getType(), retries, backoff);
        }

        try {
            var command = client.newFailCommand(job.getKey())
                    .retries(retries)
                    .errorMessage(errorMessage);
            if (retries > 0) {
                command.retryBackoff(backoff);
            }
            command.send().join();
        } catch (Exception e) {
            log.error("Không thể gửi lệnh Fail tới Zeebe [JobKey: {}]", job.getKey(), e);
        }
    }

    protected abstract void executeBusinessLogic(
            JobClient client, ActivatedJob job, String idempotencyKey) throws Exception;

    protected static class SafeToRetryException extends Exception {

        protected SafeToRetryException(String message, Exception cause) {
            super(message, cause);
        }
    }
}
