package com.unit.worker;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.boot.web.client.RestClientCustomizer;

import java.time.Duration;

@Configuration
public class WorkerHttpConfiguration {

    @Bean
    RestClientCustomizer workerRestClientCustomizer(
            @Value("${worker.http.connect-timeout:2s}") Duration connectTimeout,
            @Value("${worker.http.read-timeout:15s}") Duration readTimeout) {
        return builder -> {
            SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
            requestFactory.setConnectTimeout(connectTimeout);
            requestFactory.setReadTimeout(readTimeout);
            builder.requestFactory(requestFactory);
        };
    }
}
