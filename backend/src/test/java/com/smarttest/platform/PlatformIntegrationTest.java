package com.smarttest.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static com.smarttest.platform.PlatformService.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:platformtest;MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "platform.admin-password=TestAdminPassword123!", "platform.evidence-path=target/test-evidence", "platform.scheduler-delay-ms=3600000"})
@AutoConfigureMockMvc
class PlatformIntegrationTest {
    @Autowired PlatformService service;
    @Autowired DocumentStore store;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    final List<String> sessions=new ArrayList<>();
    @BeforeEach void reset() { jdbc.update("DELETE FROM platform_documents"); service.initialize(); service.transport((s,m)->{},s->{}); }
    @AfterEach void disconnect() { for(String id:sessions)service.disconnect(id); }
    String adminToken() { return str(service.login("admin","TestAdminPassword123!"),"token"); }
    Map<String,Object> example(boolean sensitive) {
        return map("name","Actual browser check","platform","web","framework","playwright","sensitive",sensitive,"steps",List.of(map("action","goto","target","https://example.org","value",""),map("action","expectVisible","target","h1","value","")));
    }
    Map<String,Object> approved(boolean sensitive) { var c=service.createCase(example(sensitive),"admin"); return service.approveCase(str(c,"id"),number(c,"revision",0),"admin"); }
    Map<String,Object> target(String id,String provider,List<String> tags) { return map("id",id,"name",id,"platform","web","browser","chromium","version","131","provider",provider,"tags",tags,"status","IDLE","cleanupOk",true); }
    Map<String,Object> enroll(String agent,String session,List<Map<String,Object>> targets) {
        var key=service.createKey(map("name",agent),"admin"); register(agent,session,str(key,"key"),targets); return key;
    }
    void register(String agent,String session,String key,List<Map<String,Object>> targets) {
        sessions.add(session); service.register(session,map("agentId",agent,"hostFingerprint","host-"+agent,"name",agent,"agentKey",key,"targets",targets));
    }
    Map<String,Object> submit(Map<String,Object> c) { return service.createRun(map("caseIds",List.of(c.get("id"))),"admin"); }
    Map<String,Object> result(Map<String,Object> c,String status) { return map("caseId",c.get("id"),"status",status,"durationMs",15,"error",status.equals("PASSED")?"":"failed check","steps",List.of(),"evidence",List.of()); }
    void complete(String session,Map<String,Object> run,Map<String,Object> c,boolean cleaned) {
        service.agentMessage(session,map("type","done","taskId",run.get("id"),"status","PASSED","results",List.of(result(c,"PASSED")),"logs",List.of("Executed browser assertion"),"cleanupOk",cleaned));
    }
    @Test void authenticationAndRolesRejectUnauthorizedWrites() throws Exception {
        mvc.perform(get("/api/dashboard")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"));
        mvc.perform(post("/api/auth/login").contentType("application/json").content("{\"username\":\"admin\",\"password\":\"wrong\"}")).andExpect(status().isUnauthorized());
        service.createUser(map("username","viewer","password","ViewerPassword123!","role","VIEWER"),"admin");
        String token=str(service.login("viewer","ViewerPassword123!"),"token");
        mvc.perform(get("/api/cases").header("Authorization","Bearer "+token)).andExpect(status().isOk());
        mvc.perform(post("/api/cases").header("Authorization","Bearer "+token).contentType("application/json").content(json.writeValueAsString(example(false)))).andExpect(status().isForbidden());
        mvc.perform(post("/api/agent-keys").header("Authorization","Bearer "+token).contentType("application/json").content("{\"name\":\"illegal\"}")).andExpect(status().isForbidden());
        assertTrue(service.list("audit").stream().anyMatch(a->"ACCESS_DENIED".equals(a.get("action"))));
        mvc.perform(get("/api/missing").header("Authorization","Bearer "+adminToken())).andExpect(status().isNotFound());
    }
    @Test void plaintextSecretsNeverAppearInUserOrKeyListsAndRevocationIsImmediate() {
        var key=enroll("agent1","s1",List.of(target("browser1","local",List.of())));
        assertFalse(service.list("key").getFirst().containsKey("key"));
        assertFalse(service.list("key").getFirst().containsKey("keyHash"));
        assertFalse(service.list("user").getFirst().containsKey("passwordHash"));
        AtomicBoolean closed=new AtomicBoolean(); service.transport((s,m)->{},s->closed.set(true));
        service.revokeKey(str(key,"id"),"admin"); assertTrue(closed.get());
        assertThrows(ApiException.class,()->register("agent1","s2",str(key,"key"),List.of(target("browser1","local",List.of()))));
    }
    @Test void unprobedAndMaintenanceTargetsAreNeverScheduled() {
        var dirty=target("dirty","local",List.of()); dirty.put("cleanupOk",false);
        var mobile=map("id","android","name","Physical Android","platform","android","provider","local","status","MAINTENANCE","cleanupOk",false,"tags",List.of());
        enroll("a","s",List.of(dirty,mobile)); var run=submit(approved(false)); service.tick();
        assertEquals("QUEUED",run.get("status")); assertEquals("MAINTENANCE",service.get("device","dirty").get("status")); assertEquals("MAINTENANCE",service.get("device","android").get("status"));
        service.agentMessage("s",map("type","heartbeat","targets",List.of(target("dirty","local",List.of()),mobile))); service.tick();
        assertEquals("ASSIGNED",service.get("run",str(run,"id")).get("status"));
    }
    @Test void tlsIsRequiredOutsideExplicitlyConfiguredPrivateNetworks() throws Exception {
        assertFalse(SecurityConfig.transportAllowed("172.18.0.4",false,false,null,false));
        assertTrue(SecurityConfig.transportAllowed("172.18.0.4",false,false,null,true));
        assertFalse(SecurityConfig.transportAllowed("198.51.100.20",false,false,null,true));
        assertFalse(SecurityConfig.transportAllowed("198.51.100.20",false,false,"https",true));
        assertTrue(SecurityConfig.transportAllowed("198.51.100.20",false,true,"https",false));
        mvc.perform(post("/api/auth/login").with(req->{req.setRemoteAddr("198.51.100.20");return req;}).contentType("application/json").content("{\"username\":\"admin\",\"password\":\"TestAdminPassword123!\"}")).andExpect(status().isForbidden());
    }
    @Test void caseRevisionsRequireHumanApprovalAndRunUsesImmutableSnapshot() {
        var draft=service.createCase(example(false),"admin"); assertEquals("DRAFT",draft.get("status"));
        assertThrows(ApiException.class,()->submit(draft));
        var c=service.approveCase(str(draft,"id"),number(draft,"revision",0),"admin");
        var run=submit(c); var edited=example(false); edited.put("name","Changed title");
        var revised=service.updateCase(str(c,"id"),edited,"admin"); assertEquals("DRAFT",revised.get("status"));
        assertEquals(3,service.caseHistory(str(c,"id")).size());
        assertEquals("Actual browser check",objects(store.get("run",str(run,"id")).get("_cases")).getFirst().get("name"));
        assertThrows(ApiException.class,()->service.createCase(map("name","unsafe","steps",List.of(map("action","shell","target","rm -rf /"))),"admin"));
    }
    @Test void concurrentEditCannotApproveAnUnseenRevision() throws Exception {
        var reviewed=service.createCase(example(false),"admin"); String id=str(reviewed,"id"); int expected=number(reviewed,"revision",0);
        CountDownLatch reviewerRead=new CountDownLatch(1),editorCommitted=new CountDownLatch(1);
        try(var executor=Executors.newVirtualThreadPerTaskExecutor()) {
            var editor=executor.submit(()->{ try { reviewerRead.await(); var changed=example(false); changed.put("name","Changed by another engineer"); service.updateCase(id,changed,"another-engineer"); editorCommitted.countDown(); }catch(InterruptedException e){Thread.currentThread().interrupt();throw new RuntimeException(e);} });
            reviewerRead.countDown(); assertTrue(editorCommitted.await(5,TimeUnit.SECONDS)); editor.get(5,TimeUnit.SECONDS);
            String token=adminToken();
            mvc.perform(post("/api/cases/"+id+"/approve").header("Authorization","Bearer "+token).contentType("application/json").content(json.writeValueAsString(map("revision",expected)))).andExpect(status().isConflict()).andExpect(jsonPath("$.message").exists());
            assertEquals("DRAFT",service.get("case",id).get("status"));
            assertEquals(2,service.caseHistory(id).size(),"Rejected stale review must not add an approval history event");
            mvc.perform(post("/api/cases/"+id+"/approve").header("Authorization","Bearer "+token).contentType("application/json").content("{}")).andExpect(status().isBadRequest());
            mvc.perform(post("/api/cases/"+id+"/approve").header("Authorization","Bearer "+token).contentType("application/json").content("{\"revision\":1.5}")).andExpect(status().isBadRequest());
            mvc.perform(post("/api/cases/"+id+"/approve").header("Authorization","Bearer "+token).contentType("application/json").content("{\"revision\":2}")).andExpect(status().isOk());
            assertEquals("APPROVED",service.get("case",id).get("status"));
        }
    }
    @Test void sensitiveCasesCanOnlyUseAdministratorTrustedLocalResources() {
        enroll("local","sl",List.of(target("untrusted","local",List.of("trusted"))));
        enroll("cloud","sc",List.of(target("cloud","cloud",List.of("trusted"))));
        var c=approved(true); var run=submit(c); service.tick();
        assertEquals("QUEUED",service.get("run",str(run,"id")).get("status"));
        assertFalse(strings(service.get("device","untrusted").get("tags")).contains("trusted"));
        service.updateDevice("untrusted",map("tags",List.of("trusted")),"admin"); service.tick();
        run=service.get("run",str(run,"id")); assertEquals("ASSIGNED",run.get("status")); assertEquals("untrusted",run.get("deviceId"));
        assertEquals("local",cast(run.get("deviceFingerprint")).get("provider"));
    }
    @Test void schedulingHonorsPriorityAndQueueTimeoutWithoutFabricatingResults() {
        var c=approved(false); var low=service.createRun(map("caseIds",List.of(c.get("id")),"priority",1),"admin");
        var high=service.createRun(map("caseIds",List.of(c.get("id")),"priority",20),"admin");
        enroll("a","s",List.of(target("d","local",List.of()))); service.tick();
        assertEquals("ASSIGNED",service.get("run",str(high,"id")).get("status")); assertEquals("QUEUED",service.get("run",str(low,"id")).get("status"));
        var timed=store.get("run",str(low,"id")); timed.put("createdAt",Instant.now().minusSeconds(1000).toString()); store.save("run",timed); service.tick();
        timed=service.get("run",str(low,"id")); assertEquals("TIMED_OUT",timed.get("status")); assertTrue(objects(timed.get("results")).isEmpty());
    }
    @Test void actualBrowserAndAndroidVersionsSupportNumericComponentRanges() {
        var browser=target("chromium-real","local",List.of()); browser.put("version","156.0.8078.4");
        enroll("a","s",List.of(browser)); var c=approved(false);
        var run=service.createRun(map("caseIds",List.of(c.get("id")),"capabilities",map("platform","web","browser","chromium","version",">=1")),"admin");
        assertEquals("ASSIGNED",run.get("status")); assertEquals("chromium-real",run.get("deviceId")); complete("s",run,c,true);
        var tooNew=service.createRun(map("caseIds",List.of(c.get("id")),"capabilities",map("platform","web","browser","chromium","version",">=156.0.8079")),"admin");
        assertEquals("QUEUED",tooNew.get("status"));
        assertTrue(versionMatches("156.0.8078.4",">156.0.8078.3")); assertTrue(versionMatches("156.0.8078.4","<=156.0.8078.4"));
        assertFalse(versionMatches("156.0.8078.4","<156.0.8078.4")); assertFalse(versionMatches("156.0.8078.4",">156.0.8078.4"));
        assertTrue(versionMatches("156.10"," > 156.9")); assertTrue(versionMatches("13",">=13")); assertTrue(versionMatches("13.0.0","==13"));
        assertTrue(versionMatches("14","<15")); assertFalse(versionMatches("12",">=13"));
        assertFalse(versionMatches("13.beta",">=13")); assertFalse(versionMatches("13",">=13garbage"));
        var android=map("platform","android","provider","local","version","13","tags",List.of());
        assertTrue(matches(map("capabilities",map("platform","android","version",">=13","tags",List.of())),android));
        assertFalse(matches(map("capabilities",map("platform","android","version",">13","tags",List.of())),android));
    }
    @Test void equalPriorityQueueAndHistoryUseInstantChronologyAcrossFractionPrecision() {
        var c=approved(false); var later=submit(c); var earlier=submit(c);
        Instant base=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.SECONDS).minusSeconds(1);
        String early=base.plusNanos(12_000_000).toString(),late=base.plusNanos(12_345_000).toString();
        assertTrue(early.endsWith(".012Z")); assertTrue(late.endsWith(".012345Z"));
        var first=store.get("run",str(earlier,"id")); first.put("createdAt",early); store.save("run",first);
        var second=store.get("run",str(later,"id")); second.put("createdAt",late); store.save("run",second);
        enroll("a","s",List.of(target("d","local",List.of()))); service.tick();
        assertEquals("ASSIGNED",service.get("run",str(earlier,"id")).get("status")); assertEquals("QUEUED",service.get("run",str(later,"id")).get("status"));
        assertEquals(later.get("id"),service.list("run").getFirst().get("id"),"Lists must return the genuinely later timestamp first");
        for(var h:store.list("history")) if(c.get("id").equals(h.get("caseId"))) {h.put("createdAt","CREATE".equals(h.get("action"))?early:late);store.save("history",h);}
        assertEquals("CREATE",service.caseHistory(str(c,"id")).getFirst().get("action"));
        assertEquals("APPROVE",service.caseHistory(str(c,"id")).getLast().get("action"));
    }
    @Test void assignmentOwnershipIdempotencyAndValidatedVerdict() {
        enroll("owner","so",List.of(target("d1","local",List.of()))); enroll("other","sx",List.of(target("d2","local",List.of())));
        var c=approved(false); var run=submit(c);
        assertThrows(ApiException.class,()->complete("sx",run,c,true));
        service.agentMessage("so",map("type","ack","taskId",run.get("id"))); assertEquals("RUNNING",service.get("run",str(run,"id")).get("status"));
        service.agentMessage("so",map("type","done","taskId",run.get("id"),"status","PASSED","results",List.of(result(c,"FAILED")),"cleanupOk",true));
        assertEquals("FAILED",service.get("run",str(run,"id")).get("status"));
        complete("so",run,c,true); assertEquals("FAILED",service.get("run",str(run,"id")).get("status")); assertEquals("IDLE",service.get("device","d1").get("status"));
    }
    @Test void disconnectQuarantinesResourceAndReconnectRequiresFreshCleanupProof() {
        var key=enroll("a","s1",List.of(target("d","local",List.of()))); var c=approved(false); var run=submit(c); service.disconnect("s1");
        assertEquals("FAILED",service.get("run",str(run,"id")).get("status")); assertEquals("MAINTENANCE",service.get("device","d").get("status"));
        var dirty=target("d","local",List.of()); dirty.put("cleanupOk",false); register("a","s2",str(key,"key"),List.of(dirty));
        assertEquals("MAINTENANCE",service.get("device","d").get("status"));
        service.agentMessage("s2",map("type","heartbeat","targets",List.of(target("d","local",List.of()))));
        assertEquals("IDLE",service.get("device","d").get("status"));
        assertThrows(ApiException.class,()->service.register("forged",map("agentKey",key.get("key"),"agentId","a","hostFingerprint","forged-host","targets",List.of())));
    }
    @Test void cancelAndTimeoutRemainTerminalAndRequireTaskCleanup() {
        enroll("a","s",List.of(target("d","local",List.of()))); var c=approved(false); var run=submit(c); service.cancelRun(str(run,"id"),"admin");
        assertEquals("CLEANING",service.get("device","d").get("status"));
        service.agentMessage("s",map("type","heartbeat","targets",List.of(target("d","local",List.of()))));
        assertEquals("CLEANING",service.get("device","d").get("status"));
        complete("s",run,c,true); assertEquals("CANCELLED",service.get("run",str(run,"id")).get("status")); assertEquals("IDLE",service.get("device","d").get("status"));
        var timeout=submit(c); var aged=store.get("run",str(timeout,"id")); aged.put("assignedAt",Instant.now().minusSeconds(1000).toString()); store.save("run",aged); service.tick();
        assertEquals("TIMED_OUT",service.get("run",str(timeout,"id")).get("status")); complete("s",timeout,c,false);
        assertEquals("MAINTENANCE",service.get("device","d").get("status")); assertEquals("TIMED_OUT",service.get("run",str(timeout,"id")).get("status"));
    }
    @Test void evidenceOwnershipAuthenticationAndReportExports() throws Exception {
        var key=enroll("a","s",List.of(target("d","local",List.of()))); var other=enroll("b","sb",List.of(target("db","local",List.of())));
        var c=approved(false); var run=submit(c); var file=new MockMultipartFile("file","../../capture.png","image/png",new byte[]{1,2,3});
        assertThrows(ApiException.class,()->service.uploadEvidence(str(other,"key"),str(run,"id"),file));
        var evidence=service.uploadEvidence(str(key,"key"),str(run,"id"),file); assertEquals("capture.png",evidence.get("name"));
        mvc.perform(get(str(evidence,"url"))).andExpect(status().isUnauthorized());
        mvc.perform(get(str(evidence,"url")).header("Authorization","Bearer "+adminToken())).andExpect(status().isOk()).andExpect(header().string("Content-Type","image/png"));
        var result=result(c,"PASSED"); result.put("evidence",List.of(evidence)); service.agentMessage("s",map("type","done","taskId",run.get("id"),"results",List.of(result),"cleanupOk",true));
        assertEquals("PASSED",service.get("run",str(run,"id")).get("status"));
        assertTrue(service.junit(str(run,"id")).contains("tests=\"1\" failures=\"0\""));
        assertEquals("passed",objects(service.allure(str(run,"id")).get("results")).getFirst().get("status"));
        assertThrows(ApiException.class,()->service.uploadEvidence(str(key,"key"),str(run,"id"),file));
    }
    @Test void qualityUsesActualSameCommitVerdictFlipsAndHumanReleaseOnly() throws Exception {
        enroll("a","s",List.of(target("d","local",List.of()))); var c=approved(false);
        var one=service.createRun(map("caseIds",List.of(c.get("id")),"commitSha","abc123"),"admin"); complete("s",one,c,true);
        var two=service.createRun(map("caseIds",List.of(c.get("id")),"commitSha","abc123"),"admin");
        var done=map("type","done","taskId",two.get("id"),"results",List.of(result(c,"FAILED")),"cleanupOk",true);
        service.agentMessage("s",done); service.agentMessage("s",done);
        var quality=service.get("quality",str(c,"id")); assertEquals(2,quality.get("executions")); assertEquals(0.2,((Number)quality.get("ewmaScore")).doubleValue()); assertEquals(true,quality.get("quarantined"));
        var three=service.createRun(map("caseIds",List.of(c.get("id")),"commitSha","different-commit"),"admin"); complete("s",three,c,true);
        assertEquals(true,service.get("quality",str(c,"id")).get("quarantined"));
        assertThrows(ApiException.class,()->service.releaseQuality(str(c,"id"),map("reason","x"),"admin"));
        service.createUser(map("username","reader","password","ReaderPassword123!","role","VIEWER"),"admin");
        String token=str(service.login("reader","ReaderPassword123!"),"token");
        mvc.perform(post("/api/quality/"+c.get("id")+"/release").header("Authorization","Bearer "+token).contentType("application/json").content("{\"reason\":\"Verified a real fix\"}")).andExpect(status().isForbidden());
        mvc.perform(post("/api/quality/"+c.get("id")+"/release").header("Authorization","Bearer "+adminToken()).contentType("application/json").content("{\"reason\":\"Verified a real fix\"}")).andExpect(status().isOk());
        assertEquals(false,service.get("quality",str(c,"id")).get("quarantined"));
        assertTrue(service.list("audit").stream().anyMatch(a->"RELEASE_QUALITY_QUARANTINE".equals(a.get("action"))));
    }
    @Test void infrastructureJUnitCountersAndXmlEscapingRemainValid() throws Exception {
        var c=approved(false); var run=service.createRun(map("caseIds",List.of(c.get("id")),"name","A < B & quoted \"text\""),"admin");
        service.cancelRun(str(run,"id"),"admin");
        String xml=service.junit(str(run,"id"));
        var document=javax.xml.parsers.DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(new java.io.ByteArrayInputStream(xml.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        assertEquals("1",document.getDocumentElement().getAttribute("tests")); assertEquals("1",document.getDocumentElement().getAttribute("errors")); assertEquals("A < B & quoted \"text\"",document.getDocumentElement().getAttribute("name"));
    }
    @Test void serializationRetainsAllocationLockUntilTransactionCommit() throws Exception {
        enroll("a","s",List.of(target("d","local",List.of()))); var c=approved(false);
        CountDownLatch beforeCommit=new CountDownLatch(1),releaseCommit=new CountDownLatch(1); AtomicBoolean first=new AtomicBoolean(true); AtomicInteger assignments=new AtomicInteger();
        service.transport((s,m)->{
            if("assign".equals(m.get("type"))) {
                assignments.incrementAndGet();
                if(first.compareAndSet(true,false)) TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override public void beforeCommit(boolean readOnly) { beforeCommit.countDown(); try { if(!releaseCommit.await(5,TimeUnit.SECONDS))throw new IllegalStateException("test latch timed out"); }catch(InterruptedException e){Thread.currentThread().interrupt();throw new RuntimeException(e);} }
                });
            }
        },s->{});
        try(var executor=Executors.newVirtualThreadPerTaskExecutor()) {
            var one=executor.submit(()->submit(c)); assertTrue(beforeCommit.await(5,TimeUnit.SECONDS));
            var two=executor.submit(()->submit(c));
            Thread.sleep(150); assertFalse(two.isDone(),"Second scheduler must wait through first transaction commit");
            releaseCommit.countDown(); one.get(5,TimeUnit.SECONDS); var queued=two.get(5,TimeUnit.SECONDS);
            assertEquals(1,assignments.get()); assertEquals("QUEUED",queued.get("status"));
        } finally { releaseCommit.countDown(); }
    }
}
