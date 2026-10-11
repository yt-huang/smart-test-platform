package com.smarttest.platform;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.*;

@RestController
@RequestMapping("/api")
public class ApiController {
    private final PlatformService service;
    private final DocumentStore store;
    public ApiController(PlatformService service,DocumentStore store) { this.service=service; this.store=store; }
    private String actor(HttpServletRequest request) { return request.getUserPrincipal().getName(); }
    @GetMapping("/health") public Map<String,Object> health() { store.list("agent"); return Map.of("status","UP","service","smart-test-platform"); }
    @PostMapping("/auth/login") public Map<String,Object> login(@RequestBody Map<String,Object> in) {
        String username=PlatformService.required(in,"username",64);
        try { return service.login(username,PlatformService.required(in,"password",72)); }
        catch(ApiException e) { service.audit(username,"LOGIN_FAILED","auth","Authentication rejected"); throw e; }
    }
    @GetMapping("/auth/me") public Object me(HttpServletRequest request) { return request.getAttribute("platform.user"); }
    @GetMapping("/dashboard") public Object dashboard() { return service.dashboard(); }
    @GetMapping("/settings") public Object settings() { return service.settings(); }
    @GetMapping("/quality") public Object quality() { return service.list("quality"); }
    @PostMapping("/quality/{caseId}/release") public Object releaseQuality(@PathVariable String caseId,@RequestBody Map<String,Object> in,HttpServletRequest req) { return service.releaseQuality(caseId,in,actor(req)); }
    @GetMapping("/cases") public Object cases() { return service.list("case"); }
    @GetMapping("/cases/{id}") public Object oneCase(@PathVariable String id) { return service.get("case",id); }
    @PostMapping("/cases") public Object createCase(@RequestBody Map<String,Object> in,HttpServletRequest req) { return service.createCase(in,actor(req)); }
    @PutMapping("/cases/{id}") public Object updateCase(@PathVariable String id,@RequestBody Map<String,Object> in,HttpServletRequest req) { return service.updateCase(id,in,actor(req)); }
    @PostMapping("/cases/{id}/approve") public Object approve(@PathVariable String id,HttpServletRequest req) { return service.approveCase(id,actor(req)); }
    @DeleteMapping("/cases/{id}") public Object deleteCase(@PathVariable String id,HttpServletRequest req) { service.deleteCase(id,actor(req)); return Map.of("message","Deleted"); }
    @GetMapping("/cases/{id}/history") public Object history(@PathVariable String id) { return service.caseHistory(id); }
    @GetMapping("/plans") public Object plans() { return service.list("plan"); }
    @GetMapping("/plans/{id}") public Object plan(@PathVariable String id) { return service.get("plan",id); }
    @PostMapping("/plans") public Object createPlan(@RequestBody Map<String,Object> in,HttpServletRequest req) { return service.savePlan(null,in,actor(req)); }
    @PutMapping("/plans/{id}") public Object updatePlan(@PathVariable String id,@RequestBody Map<String,Object> in,HttpServletRequest req) { return service.savePlan(id,in,actor(req)); }
    @DeleteMapping("/plans/{id}") public Object deletePlan(@PathVariable String id,HttpServletRequest req) { service.deletePlan(id,actor(req)); return Map.of("message","Deleted"); }
    @GetMapping("/runs") public Object runs() { return service.list("run"); }
    @GetMapping("/runs/{id}") public Object run(@PathVariable String id) { return service.get("run",id); }
    @PostMapping("/runs") public Object createRun(@RequestBody Map<String,Object> in,HttpServletRequest req) { return service.createRun(in,actor(req)); }
    @PostMapping("/runs/{id}/cancel") public Object cancel(@PathVariable String id,HttpServletRequest req) { return service.cancelRun(id,actor(req)); }
    @GetMapping(value="/runs/{id}/junit",produces="application/xml") public Object junit(@PathVariable String id) { return service.junit(id); }
    @GetMapping("/runs/{id}/allure") public Object allure(@PathVariable String id) { return service.allure(id); }
    @GetMapping("/agents") public Object agents() { return service.list("agent"); }
    @GetMapping("/devices") public Object devices() { return service.list("device"); }
    @PutMapping("/devices/{id}") public Object device(@PathVariable String id,@RequestBody Map<String,Object> in,HttpServletRequest req) { return service.updateDevice(id,in,actor(req)); }
    @GetMapping("/agent-keys") public Object keys() { return service.list("key"); }
    @PostMapping("/agent-keys") public Object createKey(@RequestBody Map<String,Object> in,HttpServletRequest req) { return service.createKey(in,actor(req)); }
    @DeleteMapping("/agent-keys/{id}") public Object revoke(@PathVariable String id,HttpServletRequest req) { service.revokeKey(id,actor(req)); return Map.of("message","Revoked"); }
    @GetMapping("/users") public Object users() { return service.list("user"); }
    @PostMapping("/users") public Object createUser(@RequestBody Map<String,Object> in,HttpServletRequest req) { return service.createUser(in,actor(req)); }
    @GetMapping("/audit") public Object audit(@RequestParam(required=false) String actor,@RequestParam(required=false) String target,@RequestParam(required=false) String action) {
        return service.list("audit").stream().filter(a->actor==null||actor.equals(a.get("actor"))).filter(a->target==null||target.equals(a.get("target"))).filter(a->action==null||action.equals(a.get("action"))).toList();
    }
    @PostMapping(value="/agent/evidence",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    public Object upload(@RequestHeader("X-Agent-Key") String key,@RequestParam String taskId,@RequestPart MultipartFile file) { return service.uploadEvidence(key,taskId,file); }
    @GetMapping("/evidence/{id}") public ResponseEntity<FileSystemResource> evidence(@PathVariable String id,HttpServletRequest req) {
        var evidence=service.evidence(id,actor(req));
        String contentType=PlatformService.str(evidence,"contentType");
        boolean safe=Set.of("image/png","image/jpeg","image/webp","video/webm","video/mp4","text/plain").contains(contentType);
        var disposition=safe?ContentDisposition.inline():ContentDisposition.attachment();
        return ResponseEntity.ok().contentType(safe?MediaType.parseMediaType(contentType):MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION,disposition.filename(PlatformService.str(evidence,"name"),java.nio.charset.StandardCharsets.UTF_8).build().toString())
                .header("X-Content-Type-Options","nosniff").body(new FileSystemResource(PlatformService.str(evidence,"path")));
    }
}
