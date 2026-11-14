package com.unit.worker;

import io.camunda.zeebe.client.api.response.ActivatedJob;
import io.camunda.zeebe.client.api.worker.JobClient;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import java.time.Duration;
import java.util.Map;

import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DispatchSmsWorkerTests {

    @Test
    void redeliveredJobDoesNotSendDuplicateAndChecksSuppressionFirst() {
        IdempotencyStore store = mock(IdempotencyStore.class);
        WorkerRetryPolicy retryPolicy = new WorkerRetryPolicy(
                3, Duration.ofSeconds(2), Duration.ofSeconds(30));
        SuppressionClient suppressionClient = mock(SuppressionClient.class);
        SmsGatewayClient smsGatewayClient = mock(SmsGatewayClient.class);
        when(store.claim(eq("dispatch-sms-task:req-1"), anyString()))
                .thenReturn(
                        IdempotencyStore.ClaimResult.CLAIMED,
                        IdempotencyStore.ClaimResult.COMPLETED);
        when(suppressionClient.checkBeforeSend("APL-1"))
                .thenReturn(new SuppressionClient.Decision(true, "ALLOW_PASS_TO_NEXT_GATES"));

        DispatchSmsWorker worker = new DispatchSmsWorker(
                store, retryPolicy, suppressionClient, smsGatewayClient);
        JobClient client = mock(JobClient.class, RETURNS_DEEP_STUBS);
        ActivatedJob job = activatedJob();

        worker.handleJob(client, job);
        worker.handleJob(client, job);

        InOrder order = inOrder(suppressionClient, smsGatewayClient);
        order.verify(suppressionClient).checkBeforeSend("APL-1");
        order.verify(smsGatewayClient).send("req-1", 3, "Reminder");
        verify(smsGatewayClient, times(1)).send("req-1", 3, "Reminder");
        verify(client, times(2)).newCompleteCommand(42L);
    }

    @Test
    void blockedApplicantIsCompletedWithoutSending() {
        IdempotencyStore store = mock(IdempotencyStore.class);
        WorkerRetryPolicy retryPolicy = new WorkerRetryPolicy(
                3, Duration.ofSeconds(2), Duration.ofSeconds(30));
        SuppressionClient suppressionClient = mock(SuppressionClient.class);
        SmsGatewayClient smsGatewayClient = mock(SmsGatewayClient.class);
        when(store.claim(eq("dispatch-sms-task:req-1"), anyString()))
                .thenReturn(IdempotencyStore.ClaimResult.CLAIMED);
        when(suppressionClient.checkBeforeSend("APL-1"))
                .thenReturn(new SuppressionClient.Decision(false, "BLOCK_CONTROL_HOLDOUT"));

        DispatchSmsWorker worker = new DispatchSmsWorker(
                store, retryPolicy, suppressionClient, smsGatewayClient);
        JobClient client = mock(JobClient.class, RETURNS_DEEP_STUBS);

        worker.handleJob(client, activatedJob());

        verify(suppressionClient).checkBeforeSend("APL-1");
        verify(smsGatewayClient, never()).send(anyString(), anyInt(), anyString());
        verify(store).markCompleted(eq("dispatch-sms-task:req-1"), anyString());
    }

    private ActivatedJob activatedJob() {
        ActivatedJob job = mock(ActivatedJob.class);
        when(job.getKey()).thenReturn(42L);
        when(job.getType()).thenReturn("dispatch-sms-task");
        when(job.getRetries()).thenReturn(3);
        when(job.getVariablesAsMap()).thenReturn(Map.of(
                "requestId", "req-1",
                "applicant_key", "APL-1",
                "messageContent", "Reminder"));
        return job;
    }
}
