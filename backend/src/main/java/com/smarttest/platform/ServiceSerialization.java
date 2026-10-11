package com.smarttest.platform;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.*;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import java.util.concurrent.locks.ReentrantLock;

/** Wraps the transaction advisor, retaining the resource lock through database commit/rollback. */
@Aspect
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class ServiceSerialization {
    private final ReentrantLock lock=new ReentrantLock(true);
    @Around("execution(public * com.smarttest.platform.PlatformService.*(..))")
    public Object serialized(ProceedingJoinPoint call) throws Throwable {
        lock.lock();
        try { return call.proceed(); } finally { lock.unlock(); }
    }
}
