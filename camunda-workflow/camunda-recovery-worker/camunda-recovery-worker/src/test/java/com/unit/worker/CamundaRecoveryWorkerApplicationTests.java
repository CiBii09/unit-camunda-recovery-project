package com.unit.worker;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.UUID;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:camunda-recovery-worker;DB_CLOSE_DELAY=-1",
		"spring.datasource.username=sa",
		"spring.datasource.password="
})
class CamundaRecoveryWorkerApplicationTests {

	@org.springframework.beans.factory.annotation.Autowired
	private IdempotencyStore idempotencyStore;

	@Test
	void contextLoads() {
	}

	@Test
	void completedOperationIsNotClaimedAgain() {
		String key = "test:" + UUID.randomUUID();
		String claimToken = UUID.randomUUID().toString();

		Assertions.assertEquals(IdempotencyStore.ClaimResult.CLAIMED,
				idempotencyStore.claim(key, claimToken));
		Assertions.assertEquals(IdempotencyStore.ClaimResult.IN_PROGRESS,
				idempotencyStore.claim(key, UUID.randomUUID().toString()));

		idempotencyStore.markCompleted(key, claimToken);

		Assertions.assertEquals(IdempotencyStore.ClaimResult.COMPLETED,
				idempotencyStore.claim(key, UUID.randomUUID().toString()));
	}

}
