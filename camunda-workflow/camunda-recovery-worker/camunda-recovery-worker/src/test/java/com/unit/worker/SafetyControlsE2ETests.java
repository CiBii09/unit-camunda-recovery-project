package com.unit.worker;

import io.camunda.zeebe.client.api.response.ActivatedJob;
import io.camunda.zeebe.client.api.worker.JobClient;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SafetyControlsE2ETests {

    @Test
    void oneThousandMockJobsPauseAndResumeWithoutLosingSafeHeldWork() {
        IdempotencyStore store = mock(IdempotencyStore.class);
        WorkerRetryPolicy retryPolicy = new WorkerRetryPolicy(
                3, Duration.ofSeconds(2), Duration.ofSeconds(30));
        SuppressionClient suppressionClient = mock(SuppressionClient.class);
        SmsGatewayClient smsGatewayClient = mock(SmsGatewayClient.class);
        SafetyControlClient safetyControlClient = mock(SafetyControlClient.class);
        AtomicReference<SafetyControlClient.SafetyStatus> status = new AtomicReference<>(
                new SafetyControlClient.SafetyStatus(false, false, "test-operator", "start"));
        AtomicInteger sentCount = new AtomicInteger();
        AtomicInteger gatewayCallsWhileBlocked = new AtomicInteger();
        List<ActivatedJob> heldJobs = new ArrayList<>();

        when(store.claim(anyString(), anyString()))
                .thenReturn(IdempotencyStore.ClaimResult.CLAIMED);
        when(safetyControlClient.getStatus()).thenAnswer(invocation -> status.get());
        when(suppressionClient.checkBeforeSend(anyString()))
                .thenReturn(new SuppressionClient.Decision(true, "ALLOW_PASS_TO_NEXT_GATES"));
        when(smsGatewayClient.send(anyString(), anyInt(), anyString()))
                .thenAnswer(invocation -> {
                    if (status.get().blocksDispatch()) {
                        gatewayCallsWhileBlocked.incrementAndGet();
                    }
                    sentCount.incrementAndGet();
                    return new SmsGatewayClient.GatewayReceipt(
                            "ADAPTER_SUCCESS", "GW-" + invocation.getArgument(0), "SENT", "test-time");
                });

        DispatchSmsWorker worker = new DispatchSmsWorker(
                store, retryPolicy, suppressionClient, smsGatewayClient, safetyControlClient);
        JobClient client = mock(JobClient.class, RETURNS_DEEP_STUBS);

        for (int i = 1; i <= 400; i++) {
            worker.handleJob(client, job(i));
        }
        int sentBeforePause = sentCount.get();

        status.set(new SafetyControlClient.SafetyStatus(true, true, "test-operator", "kill-on"));
        for (int i = 401; i <= 600; i++) {
            worker.handleJob(client, job(i));
            heldJobs.add(job(i));
        }
        int sentWithKillSwitchOn = sentCount.get();

        status.set(new SafetyControlClient.SafetyStatus(false, true, "test-operator", "queue-paused"));
        for (int i = 601; i <= 800; i++) {
            worker.handleJob(client, job(i));
            heldJobs.add(job(i));
        }
        int sentWhileBlocked = sentCount.get();

        status.set(new SafetyControlClient.SafetyStatus(false, false, "test-operator", "resumed"));
        for (int i = 801; i <= 1000; i++) {
            worker.handleJob(client, job(i));
        }
        for (ActivatedJob heldJob : heldJobs) {
            worker.handleJob(client, heldJob);
        }

        assertEquals(1000, sentCount.get());
        assertEquals(0, gatewayCallsWhileBlocked.get());
        assertEquals(400, heldJobs.size());
        assertEquals(400, sentBeforePause);
        assertEquals(sentBeforePause, sentWithKillSwitchOn);
        assertEquals(sentBeforePause, sentWhileBlocked);
        verify(store, times(400)).release(anyString(), anyString());
        verify(smsGatewayClient, times(1)).send(
                eq("REQ-401"), anyInt(), anyString());

        System.out.printf(
                "SAFETY_CONTROL event=KILL_SWITCH_ON held=200 sends_while_active=0%n");
        System.out.printf(
                "SAFETY_CONTROL event=QUEUE_PAUSE_ON held=200 sends_while_paused=0%n");
        System.out.printf(
                "SAFETY_CONTROL event=CONTROLS_RESET resumed_held_jobs=%d%n", heldJobs.size());
        System.out.printf(
                "E2E_SAFETY_RESULT total=1000 sent_before_pause=400 "
                        + "kill_switch_held=200 queue_pause_held=200 "
                        + "sent_after_resume=400 total_sent=1000 "
                        + "gateway_calls_while_blocked=0%n");
    }

    private static ActivatedJob job(int index) {
        ActivatedJob job = mock(ActivatedJob.class);
        when(job.getKey()).thenReturn((long) index);
        when(job.getType()).thenReturn("dispatch-sms-task");
        when(job.getRetries()).thenReturn(3);
        when(job.getVariablesAsMap()).thenReturn(Map.of(
                "requestId", "REQ-" + index,
                "applicant_key", "APL-" + index,
                "messageContent", "Mock recovery message"));
        return job;
    }
}
