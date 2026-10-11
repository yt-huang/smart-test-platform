package com.smarttest.platform;

import org.springframework.http.HttpStatus;

public class ApiException extends RuntimeException {
    final HttpStatus status;
    public ApiException(HttpStatus status, String message) { super(message); this.status = status; }
    static ApiException bad(String message) { return new ApiException(HttpStatus.BAD_REQUEST, message); }
    static ApiException forbidden(String message) { return new ApiException(HttpStatus.FORBIDDEN, message); }
    static ApiException unauthorized(String message) { return new ApiException(HttpStatus.UNAUTHORIZED, message); }
    static ApiException missing() { return new ApiException(HttpStatus.NOT_FOUND, "Resource not found"); }
}
