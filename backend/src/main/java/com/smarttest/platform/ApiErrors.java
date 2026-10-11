package com.smarttest.platform;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import java.util.Map;

@RestControllerAdvice
public class ApiErrors {
    @ExceptionHandler(ApiException.class) ResponseEntity<?> api(ApiException e) { return ResponseEntity.status(e.status).body(Map.of("message",e.getMessage())); }
    @ExceptionHandler({HttpMessageNotReadableException.class,MissingServletRequestParameterException.class,IllegalArgumentException.class}) ResponseEntity<?> invalid(Exception e) { return ResponseEntity.badRequest().body(Map.of("message","Invalid request")); }
    @ExceptionHandler(MaxUploadSizeExceededException.class) ResponseEntity<?> tooLarge(Exception e) { return ResponseEntity.status(413).body(Map.of("message","Evidence exceeds 100 MiB limit")); }
}
