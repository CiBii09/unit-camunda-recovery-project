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
        SafetyControlClient safetyControlClient = mock(SafetyControlClient.class);
        when(store.claim(eq("dispatch-sms-task:req-1"), anyString()))
                .thenReturn(
                        IdempotencyStore.ClaimResult.CLAIMED,
                        IdempotencyStore.ClaimResult.COMPLETED);
        when(store.getCompletionVariables("dispatch-sms-task:req-1"))
                .thenReturn(Map.of("dispatchDecision", "SENT"));
        when(suppressionClient.checkBeforeSend("APL-1"))
                .thenReturn(new SuppressionClient.Decision(true, "ALLOW_PASS_TO_NEXT_GATES"));
        when(safetyControlClient.getStatus())
                .thenReturn(new SafetyControlClient.SafetyStatus(false, false, "operator", "now"));
        when(smsGatewayClient.send("req-1", 3, "Reminder"))
                .thenReturn(new SmsGatewayClient.GatewayReceipt(
                        "ADAPTER_SUCCESS", "GW-1", "SENT", "2026-11-21T00:00:00Z"));

        DispatchSmsWorker worker = new DispatchSmsWorker(
                store, retryPolicy, suppressionClient, smsGatewayClient, safetyControlClient);
        JobClient client = mock(JobClient.class, RETURNS_DEEP_STUBS);
        ActivatedJob job = activatedJob();

        worker.handleJob(client, job);
        worker.handleJob(client, job);

        InOrder order = inOrder(suppressionClient, smsGatewayClient);
        order.verify(suppressionClient).checkBeforeSend("APL-1");
        order.verify(smsGatewayClient).send("req-1", 3, "Reminder");
        verify(safetyControlClient, times(2)).getStatus();
        verify(smsGatewayClient, times(1)).send("req-1", 3, "Reminder");
        verify(client, times(2)).newCompleteCommand(42L);
        verify(client.newCompleteCommand(42L)).variables(Map.of(
                "dispatchDecision", "SENT",
                "gatewayStatus", "ADAPTER_SUCCESS",
                "gatewayMessageId", "GW-1",
                "deliveryStatus", "SENT",
                "sentAt", "2026-11-21T00:00:00Z"));
        verify(client.newCompleteCommand(42L)).variables(
                Map.of("dispatchDecision", "SENT"));
    }

    @Test
    void blockedApplicantIsCompletedWithoutSending() {
        IdempotencyStore store = mock(IdempotencyStore.class);
        WorkerRetryPolicy retryPolicy = new WorkerRetryPolicy(
                3, Duration.ofSeconds(2), Duration.ofSeconds(30));
        SuppressionClient suppressionClient = mock(SuppressionClient.class);
        SmsGatewayClient smsGatewayClient = mock(SmsGatewayClient.class);
        SafetyControlClient safetyControlClient = mock(SafetyControlClient.class);
        when(store.claim(eq("dispatch-sms-task:req-1"), anyString()))
                .thenReturn(IdempotencyStore.ClaimResult.CLAIMED);
        when(suppressionClient.checkBeforeSend("APL-1"))
                .thenReturn(new SuppressionClient.Decision(false, "BLOCK_CONTROL_HOLDOUT"));
        when(safetyControlClient.getStatus())
                .thenReturn(new SafetyControlClient.SafetyStatus(false, false, "operator", "now"));

        DispatchSmsWorker worker = new DispatchSmsWorker(
                store, retryPolicy, suppressionClient, smsGatewayClient, safetyControlClient);
        JobClient client = mock(JobClient.class, RETURNS_DEEP_STUBS);

        worker.handleJob(client, activatedJob());

        verify(suppressionClient).checkBeforeSend("APL-1");
        verify(smsGatewayClient, never()).send(anyString(), anyInt(), anyString());
        verify(store).markCompleted(
                eq("dispatch-sms-task:req-1"), anyString(),
                org.mockito.ArgumentMatchers.anyMap());
    }

    @Test
    void activeKillSwitchRoutesToSafeHoldAndKeepsIdempotencyKeyAvailableForResume() {
        IdempotencyStore store = mock(IdempotencyStore.class);
        WorkerRetryPolicy retryPolicy = new WorkerRetryPolicy(
                3, Duration.ofSeconds(2), Duration.ofSeconds(30));
        SuppressionClient suppressionClient = mock(SuppressionClient.class);
        SmsGatewayClient smsGatewayClient = mock(SmsGatewayClient.class);
        SafetyControlClient safetyControlClient = mock(SafetyControlClient.class);
        when(store.claim(eq("dispatch-sms-task:req-1"), anyString()))
                .thenReturn(IdempotencyStore.ClaimResult.CLAIMED);
        when(safetyControlClient.getStatus())
                .thenReturn(new SafetyControlClient.SafetyStatus(true, true, "operator", "now"));

        DispatchSmsWorker worker = new DispatchSmsWorker(
                store, retryPolicy, suppressionClient, smsGatewayClient, safetyControlClient);
        JobClient client = mock(JobClient.class, RETURNS_DEEP_STUBS);

        worker.handleJob(client, activatedJob());

        verify(smsGatewayClient, never()).send(anyString(), anyInt(), anyString());
        verify(suppressionClient, never()).checkBeforeSend(anyString());
        verify(store).release(eq("dispatch-sms-task:req-1"), anyString());
        verify(store, never()).markCompleted(
                eq("dispatch-sms-task:req-1"), anyString(),
                org.mockito.ArgumentMatchers.anyMap());
        verify(client.newCompleteCommand(42L)).variables(
                org.mockito.ArgumentMatchers.<Map<String, Object>>argThat(
                variables -> "SAFE_HOLD".equals(variables.get("dispatchDecision"))
                        && "KILL_SWITCH_ACTIVE".equals(variables.get("blockReason"))
                        && Boolean.TRUE.equals(variables.get("resumeRequired"))));
    }

    @Test
    void safetyApiFailureFailsClosedToSafeHold() {
        IdempotencyStore store = mock(IdempotencyStore.class);
        WorkerRetryPolicy retryPolicy = new WorkerRetryPolicy(
                3, Duration.ofSeconds(2), Duration.ofSeconds(30));
        SuppressionClient suppressionClient = mock(SuppressionClient.class);
        SmsGatewayClient smsGatewayClient = mock(SmsGatewayClient.class);
        SafetyControlClient safetyControlClient = mock(SafetyControlClient.class);
        when(store.claim(eq("dispatch-sms-task:req-1"), anyString()))
                .thenReturn(IdempotencyStore.ClaimResult.CLAIMED);
        when(safetyControlClient.getStatus()).thenThrow(new IllegalStateException("API unavailable"));

        DispatchSmsWorker worker = new DispatchSmsWorker(
                store, retryPolicy, suppressionClient, smsGatewayClient, safetyControlClient);
        JobClient client = mock(JobClient.class, RETURNS_DEEP_STUBS);

        worker.handleJob(client, activatedJob());

        verify(smsGatewayClient, never()).send(anyString(), anyInt(), anyString());
        verify(store).release(eq("dispatch-sms-task:req-1"), anyString());
        verify(client.newCompleteCommand(42L)).variables(
                org.mockito.ArgumentMatchers.<Map<String, Object>>argThat(
                variables -> "SAFE_HOLD".equals(variables.get("dispatchDecision"))
                        && "SAFETY_STATUS_UNAVAILABLE".equals(variables.get("blockReason"))));
    }

    @Test
    void queuePauseActivatedAfterSuppressionBlocksGatewayRequest() {
        IdempotencyStore store = mock(IdempotencyStore.class);
        WorkerRetryPolicy retryPolicy = new WorkerRetryPolicy(
                3, Duration.ofSeconds(2), Duration.ofSeconds(30));
        SuppressionClient suppressionClient = mock(SuppressionClient.class);
        SmsGatewayClient smsGatewayClient = mock(SmsGatewayClient.class);
        SafetyControlClient safetyControlClient = mock(SafetyControlClient.class);
        when(store.claim(eq("dispatch-sms-task:req-1"), anyString()))
                .thenReturn(IdempotencyStore.ClaimResult.CLAIMED);
        when(safetyControlClient.getStatus())
                .thenReturn(
                        new SafetyControlClient.SafetyStatus(false, false, "operator", "now"),
                        new SafetyControlClient.SafetyStatus(false, true, "operator", "later"));
        when(suppressionClient.checkBeforeSend("APL-1"))
                .thenReturn(new SuppressionClient.Decision(true, "ALLOW_PASS_TO_NEXT_GATES"));

        DispatchSmsWorker worker = new DispatchSmsWorker(
                store, retryPolicy, suppressionClient, smsGatewayClient, safetyControlClient);
        JobClient client = mock(JobClient.class, RETURNS_DEEP_STUBS);

        worker.handleJob(client, activatedJob());

        verify(smsGatewayClient, never()).send(anyString(), anyInt(), anyString());
        verify(store).release(eq("dispatch-sms-task:req-1"), anyString());
        verify(client.newCompleteCommand(42L)).variables(
                org.mockito.ArgumentMatchers.<Map<String, Object>>argThat(
                variables -> "SAFE_HOLD".equals(variables.get("dispatchDecision"))
                        && "QUEUE_PAUSED".equals(variables.get("blockReason"))));
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
