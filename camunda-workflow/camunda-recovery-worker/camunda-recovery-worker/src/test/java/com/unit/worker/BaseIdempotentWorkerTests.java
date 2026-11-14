package com.unit.worker;

import io.camunda.zeebe.client.api.response.ActivatedJob;
import io.camunda.zeebe.client.api.worker.JobClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:camunda-recovery-worker;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password="
})
class BaseIdempotentWorkerTests {

    @Autowired
    private IdempotencyStore idempotencyStore;

    @Autowired
    private WorkerRetryPolicy retryPolicy;

    @Test
    void redeliveredCompletedJobDoesNotRepeatBusinessLogic() {
        long jobKey = 101L;
        JobClient client = mock(JobClient.class, RETURNS_DEEP_STUBS);
        ActivatedJob job = activatedJob(jobKey);
        CountingWorker worker = new CountingWorker(
                idempotencyStore, retryPolicy, "test:" + UUID.randomUUID(), false);

        worker.handleJob(client, job);
        worker.handleJob(client, job);

        assertEquals(1, worker.executionCount());
        verify(client, times(2)).newCompleteCommand(jobKey);
    }

    @Test
    void redeliveryAfterUncertainFailureDoesNotRepeatBusinessLogic() {
        long jobKey = 202L;
        JobClient client = mock(JobClient.class, RETURNS_DEEP_STUBS);
        ActivatedJob job = activatedJob(jobKey);
        CountingWorker worker = new CountingWorker(
                idempotencyStore, retryPolicy, "test:" + UUID.randomUUID(), true);

        worker.handleJob(client, job);
        worker.handleJob(client, job);

        assertEquals(1, worker.executionCount());
        verify(client, times(2)).newFailCommand(jobKey);
    }

    @Test
    void safeFailureReleasesClaimSoZeebeRetryCanRunBusinessLogic() {
        long jobKey = 303L;
        JobClient client = mock(JobClient.class, RETURNS_DEEP_STUBS);
        ActivatedJob job = activatedJob(jobKey);
        SafeRetryWorker worker = new SafeRetryWorker(
                idempotencyStore, retryPolicy, "test:" + UUID.randomUUID());

        worker.handleJob(client, job);
        worker.handleJob(client, job);

        assertEquals(2, worker.executionCount());
        verify(client, times(1)).newFailCommand(jobKey);
        verify(client, times(1)).newCompleteCommand(jobKey);
    }

    private ActivatedJob activatedJob(long jobKey) {
        ActivatedJob job = mock(ActivatedJob.class);
        when(job.getKey()).thenReturn(jobKey);
        when(job.getType()).thenReturn("test-worker");
        when(job.getRetries()).thenReturn(3);
        return job;
    }

    private static class CountingWorker extends BaseIdempotentWorker {

        private final String idempotencyKey;
        private final boolean failAfterSideEffect;
        private final AtomicInteger executionCount = new AtomicInteger();

        private CountingWorker(
                IdempotencyStore idempotencyStore,
                WorkerRetryPolicy retryPolicy,
                String idempotencyKey,
                boolean failAfterSideEffect) {
            super(idempotencyStore, retryPolicy);
            this.idempotencyKey = idempotencyKey;
            this.failAfterSideEffect = failAfterSideEffect;
        }

        @Override
        protected String getIdempotencyKey(ActivatedJob job) {
            return idempotencyKey;
        }

        @Override
        protected void executeBusinessLogic(
                JobClient client, ActivatedJob job, String idempotencyKey) throws Exception {
            executionCount.incrementAndGet();
            if (failAfterSideEffect) {
                throw new Exception("Simulated timeout after side effect");
            }
        }

        private int executionCount() {
            return executionCount.get();
        }
    }

    private static class SafeRetryWorker extends BaseIdempotentWorker {

        private final String idempotencyKey;
        private final AtomicInteger executionCount = new AtomicInteger();

        private SafeRetryWorker(
                IdempotencyStore idempotencyStore,
                WorkerRetryPolicy retryPolicy,
                String idempotencyKey) {
            super(idempotencyStore, retryPolicy);
            this.idempotencyKey = idempotencyKey;
        }

        @Override
        protected String getIdempotencyKey(ActivatedJob job) {
            return idempotencyKey;
        }

        @Override
        protected void executeBusinessLogic(
                JobClient client, ActivatedJob job, String idempotencyKey) throws Exception {
            if (executionCount.incrementAndGet() == 1) {
                throw new SafeToRetryException("Failure before side effect", null);
            }
        }

        private int executionCount() {
            return executionCount.get();
        }
    }
}
