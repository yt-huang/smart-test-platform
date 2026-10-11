package com.smarttest.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.w3c.dom.Element;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import static com.smarttest.platform.PlatformService.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Protocol/API behavior checks; these messages are fixtures, not evidence of real browser execution. */
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:gatetest;MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "platform.admin-password=TestAdminPassword123!", "platform.evidence-path=target/test-gate-evidence", "platform.scheduler-delay-ms=3600000"})
@AutoConfigureMockMvc
class GateIntegrationTest {
    @Autowired PlatformService service;
    @Autowired DocumentStore store;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    boolean enrolled;
    @BeforeEach void reset() { jdbc.update("DELETE FROM platform_documents"); service.initialize(); service.transport((s,m)->{},s->{}); }
    @AfterEach void disconnect() { if(enrolled) service.disconnect("gate-session"); }
    Map<String,Object> example(String name) { return map("name",name,"steps",List.of(map("action","goto","target","https://example.org"))); }
    Map<String,Object> approved(String name) { var c=service.createCase(example(name),"admin"); return service.approveCase(str(c,"id"),number(c,"revision",0),"admin"); }
    void enroll(boolean firefox) {
        var targets=new ArrayList<Map<String,Object>>();
        for(String browser:firefox?List.of("chromium","firefox"):List.of("chromium")) targets.add(map("id",browser,"platform","web","browser",browser,"version","131","provider","local","status","IDLE","cleanupOk",true));
        var key=service.createKey(map("name","Gate protocol fixture"),"admin");
        service.register("gate-session",map("agentId","gate-agent","hostFingerprint","gate-fixture-host","agentKey",key.get("key"),"targets",targets)); enrolled=true;
    }
    void isolate(Map<String,Object> c) { store.save("quality",map("id",c.get("id"),"caseId",c.get("id"),"createdAt",now(),"quarantined",true,"executions",0,"passed",0,"failed",0,"ewmaScore",0.2)); }
    Map<String,Object> submit(Map<String,Object> c) { return service.createRun(map("caseIds",List.of(c.get("id")),"commitSha","identical-commit"),"admin"); }
    Map<String,Object> result(Map<String,Object> c,String status) { return map("caseId",c.get("id"),"status",status,"error","Assert <expected> & actual \"mismatch\"\u0001","durationMs",15,"steps",List.of()); }
    Map<String,Object> message(Map<String,Object> run,List<Map<String,Object>> results) { return map("type","done","taskId",run.get("id"),"results",results,"cleanupOk",true); }
    void done(Map<String,Object> run,Map<String,Object> c,String status) { service.agentMessage("gate-session",message(run,List.of(result(c,status)))); }
    Map<String,Object> gate(Map<String,Object> run) { return cast(service.get("run",str(run,"id")).get("gate")); }
    Element xml(String source) throws Exception { return javax.xml.parsers.DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(new ByteArrayInputStream(source.getBytes(StandardCharsets.UTF_8))).getDocumentElement(); }
    Element suite(Map<String,Object> run) throws Exception { return xml(service.gateJunit(str(run,"id"),"admin")); }
    void counters(Element suite,int tests,int failures,int skipped,int errors) {
        assertEquals(String.valueOf(tests),suite.getAttribute("tests")); assertEquals(String.valueOf(failures),suite.getAttribute("failures"));
        assertEquals(String.valueOf(skipped),suite.getAttribute("skipped")); assertEquals(String.valueOf(errors),suite.getAttribute("errors"));
        assertEquals(tests,suite.getElementsByTagName("testcase").getLength()); assertEquals(failures,suite.getElementsByTagName("failure").getLength());
        assertEquals(skipped,suite.getElementsByTagName("skipped").getLength()); assertEquals(errors,suite.getElementsByTagName("error").getLength());
    }
    Map<String,Object> matrix(Map<String,Object> c) {
        var plan=service.savePlan(null,map("name","Matrix & frozen","caseIds",List.of(c.get("id"))),"admin");
        return service.createMatrix(map("planId",plan.get("id"),"variants",List.of(map("label","Chromium","capabilities",map("browser","chromium")),map("label","Firefox","capabilities",map("browser","firefox")))),"admin");
    }
    Map<String,Object> child(Map<String,Object> matrix,int index) { return service.get("run",str(objects(matrix.get("variants")).get(index),"runId")); }
    String token(String role) { String name=role.toLowerCase(Locale.ROOT); service.createUser(map("username","gate-"+name,"password","GateReaderPassword123!","role",role),"admin"); return str(service.login("gate-"+name,"GateReaderPassword123!"),"token"); }

    @Test void firstFlipBlocksAndSubmissionSnapshotSurvivesReleaseEditAndDeletion() throws Exception {
        enroll(false); var c=approved("Original approved case");
        var pass=submit(c); done(pass,c,"PASSED"); assertEquals("PASSED",gate(pass).get("status"));
        var firstFailure=submit(c); done(firstFailure,c,"FAILED"); assertEquals(true,service.get("quality",str(c,"id")).get("quarantined"));
        assertEquals("BLOCKED",gate(firstFailure).get("status")); assertEquals(List.of(),gate(firstFailure).get("quarantinedCaseIds"));
        var in=map("caseIds",List.of(c.get("id")),"commitSha","identical-commit","quarantinedCaseIds",List.of(),"gate",map("status","PASSED"),"_gateSubmission",map("quarantinedCaseIds",List.of()));
        var quarantined=service.createRun(in,"admin"); assertEquals(List.of(c.get("id")),gate(quarantined).get("quarantinedCaseIds"));
        service.releaseQuality(str(c,"id"),map("reason","Reviewed and released"),"admin"); service.updateCase(str(c,"id"),example("Edited after submission"),"admin");
        done(quarantined,c,"FAILED"); var frozen=gate(quarantined); assertEquals("WARN",frozen.get("status")); assertEquals("FAILED",service.get("run",str(quarantined,"id")).get("status"));
        String report=service.gateJunit(str(quarantined,"id"),"admin"); counters(xml(report),1,0,1,0);
        assertTrue(report.contains("Original approved case")); assertTrue(report.contains("Quarantined failure: Assert &lt;expected&gt;"));
        assertTrue(report.contains("originalStatus\" value=\"FAILED")); assertTrue(service.junit(str(quarantined,"id")).contains("<failure"));
        var revised=service.get("case",str(c,"id")); service.approveCase(str(c,"id"),number(revised,"revision",0),"admin");
        var released=submit(c); done(released,c,"FAILED"); assertEquals("BLOCKED",gate(released).get("status"));
        service.deleteCase(str(c,"id"),"admin"); service.initialize();
        assertEquals(frozen,gate(quarantined)); assertEquals(report,service.gateJunit(str(quarantined,"id"),"admin"));
        assertFalse(service.get("run",str(quarantined,"id")).keySet().stream().anyMatch(k->k.startsWith("_")||k.equals("completionReceived")));
    }

    @Test void mixedPassedQuarantinedAndOrdinaryFailuresConservePlannedTotal() throws Exception {
        enroll(false); var passed=approved("Passing"); var isolated=approved("Quarantined"); var blocking=approved("Blocking"); isolate(isolated);
        var run=service.createRun(map("caseIds",List.of(passed.get("id"),isolated.get("id"),blocking.get("id"))),"admin");
        var done=message(run,List.of(result(passed,"PASSED"),result(isolated,"FAILED"),result(blocking,"FAILED"))); done.put("status","FAILED"); service.agentMessage("gate-session",done);
        var gate=gate(run); assertEquals("BLOCKED",gate.get("status")); assertEquals(3,gate.get("total")); assertEquals(1,gate.get("passed"));
        assertEquals(1,gate.get("blockingFailures")); assertEquals(1,gate.get("quarantinedFailures")); assertEquals(0,gate.get("infrastructureFailures")); counters(suite(run),3,1,1,0);
    }

    @Test void skippedTimedOutAndImplicitFailedStatusesCannotBeQuarantined() throws Exception {
        enroll(false); var c=approved("Status boundary"); isolate(c);
        for(String status:List.of("SKIPPED","TIMED_OUT","missing","null")) {
            var run=submit(c); var result=result(c,"FAILED");
            if(status.equals("missing")) result.remove("status"); else if(status.equals("null")) result.put("status",null); else result.put("status",status);
            service.agentMessage("gate-session",message(run,List.of(result)));
            var gate=gate(run); assertEquals("BLOCKED",gate.get("status")); assertEquals(1,gate.get("blockingFailures")); assertEquals(0,gate.get("quarantinedFailures"));
            counters(suite(run),status.equals("missing")||status.equals("null")?2:1,1,0,status.equals("missing")||status.equals("null")?1:0);
        }
        assertEquals(0,service.get("quality",str(c,"id")).get("executions"),"Implicit statuses must not manufacture quality verdicts");
    }

    @Test void missingResultsAreBlockingEvenWhenSyntheticFailedCaseIsQuarantined() throws Exception {
        enroll(false); var c=approved("Missing result"); isolate(c); var run=submit(c);
        service.agentMessage("gate-session",message(run,List.of()));
        var gate=gate(run); assertEquals("BLOCKED",gate.get("status")); assertEquals(1,gate.get("blockingFailures")); assertEquals(0,gate.get("quarantinedFailures"));
        assertTrue(number(gate,"infrastructureFailures",0)>0); assertEquals(List.of(),cast(store.get("run",str(run,"id")).get("_completion")).get("suppliedCaseIds"));
        var report=suite(run); assertEquals(1,report.getElementsByTagName("failure").getLength()); assertTrue(report.getElementsByTagName("error").getLength()>0);
    }

    @Test void absentOrFailedCleanupAlwaysBlocksQuarantinedFailure() throws Exception {
        enroll(false); var c=approved("Cleanup boundary"); isolate(c);
        var run=submit(c); var done=message(run,List.of(result(c,"FAILED"))); done.remove("cleanupOk"); service.agentMessage("gate-session",done);
        assertEquals("BLOCKED",gate(run).get("status")); counters(suite(run),2,0,1,1);
        service.agentMessage("gate-session",map("type","heartbeat","targets",List.of(map("id","chromium","platform","web","browser","chromium","version","131","status","IDLE","cleanupOk",true))));
        var dirty=submit(c); done=message(dirty,List.of(result(c,"FAILED"))); done.put("cleanupOk",false); service.agentMessage("gate-session",done);
        assertEquals("BLOCKED",gate(dirty).get("status")); counters(suite(dirty),2,0,1,1);
    }

    @Test void everyExplicitInfrastructureErrorBlocksAndRemainsInternal() throws Exception {
        enroll(false); var c=approved("Infrastructure boundary"); isolate(c);
        for(String error:List.of("EXECUTOR_FAILED","CASE_VALIDATION_FAILED","EXECUTION_ABORTED","EVIDENCE_UPLOAD_FAILED")) {
            var run=submit(c); var done=message(run,List.of(result(c,"FAILED"))); done.put("status","FAILED"); done.put("infrastructureErrors",List.of(error));
            service.agentMessage("gate-session",done); assertEquals("BLOCKED",gate(run).get("status")); assertEquals(1,gate(run).get("infrastructureFailures")); counters(suite(run),2,0,1,1);
            assertEquals(List.of(error),cast(store.get("run",str(run,"id")).get("_completion")).get("infrastructureErrors"));
            assertFalse(json.writeValueAsString(service.get("run",str(run,"id"))).contains("infrastructureErrors"));
        }
        assertEquals(0,service.get("quality",str(c,"id")).get("executions"),"Executor failures must not manufacture assertion quality samples");
    }

    @Test void malformedInfrastructureArraysAndCaseIdsRejectWithoutCompletingAssignment() {
        enroll(false); var c=approved("Validation boundary"); var run=submit(c);
        for(Object invalid:List.of("EXECUTOR_FAILED",Collections.nCopies(21,"EXECUTOR_FAILED"),List.of("x".repeat(101)),List.of("UNKNOWN"),List.of(1))) {
            var done=message(run,List.of(result(c,"PASSED"))); done.put("infrastructureErrors",invalid); assertThrows(ApiException.class,()->service.agentMessage("gate-session",done));
        }
        var nullErrors=message(run,List.of(result(c,"PASSED"))); nullErrors.put("infrastructureErrors",null); assertThrows(ApiException.class,()->service.agentMessage("gate-session",nullErrors));
        for(var results:List.of(List.of(map("status","PASSED")),List.of(map("caseId","wrong-id","status","FAILED")),List.of(result(c,"PASSED"),result(c,"PASSED")),List.of(result(c,"UNKNOWN")))) {
            assertThrows(ApiException.class,()->service.agentMessage("gate-session",message(run,results)));
        }
        assertEquals("ASSIGNED",service.get("run",str(run,"id")).get("status")); assertEquals("PENDING",gate(run).get("status"));
        assertFalse(store.get("run",str(run,"id")).containsKey("_completion")); done(run,c,"PASSED"); assertEquals("PASSED",gate(run).get("status"));
    }

    @Test void contradictoryFailedEnvelopeWithAllPassedCasesIsInfrastructureFailure() throws Exception {
        enroll(false); var c=approved("Contradictory envelope"); var run=submit(c); var done=message(run,List.of(result(c,"PASSED"))); done.put("status","FAILED");
        service.agentMessage("gate-session",done); assertEquals("FAILED",service.get("run",str(run,"id")).get("status")); assertEquals("BLOCKED",gate(run).get("status")); counters(suite(run),2,0,0,1);
    }

    @Test void topLevelFailedEnvelopeWithOnlyQuarantinedAssertionFailureAllowsWarn() throws Exception {
        enroll(false); var c=approved("Normal assertion failure"); isolate(c); var run=submit(c); var done=message(run,List.of(result(c,"FAILED"))); done.put("status","FAILED"); done.put("infrastructureErrors",List.of());
        service.agentMessage("gate-session",done); assertEquals("FAILED",service.get("run",str(run,"id")).get("status")); assertEquals("WARN",gate(run).get("status")); counters(suite(run),1,0,1,0);
    }

    @Test void cancelledAndExecutionTimedOutRunsFreezeGateBeforeLateDone() throws Exception {
        enroll(false); var c=approved("Late result"); isolate(c);
        for(boolean timeout:List.of(false,true)) {
            var run=submit(c);
            if(timeout) { var aged=store.get("run",str(run,"id")); aged.put("assignedAt",Instant.now().minusSeconds(1000).toString()); store.save("run",aged); service.tick(); }
            else service.cancelRun(str(run,"id"),"admin");
            var stored=store.get("run",str(run,"id")); assertTrue(stored.containsKey("_gate")); assertTrue(stored.containsKey("_gateExport"));
            var frozen=gate(run); String before=service.gateJunit(str(run,"id"),"admin"); done(run,c,"PASSED");
            var late=service.get("run",str(run,"id")); assertEquals(timeout?"TIMED_OUT":"CANCELLED",late.get("status")); assertEquals(1,cast(late.get("summary")).get("passed"));
            assertEquals(frozen,gate(run)); assertEquals(before,service.gateJunit(str(run,"id"),"admin")); assertEquals("BLOCKED",frozen.get("status")); assertTrue(number(frozen,"infrastructureFailures",0)>0);
            assertTrue(service.junit(str(run,"id")).contains("<error"));
        }
    }

    @Test void queueTimeoutDisconnectAndPlatformRestartNeverAllowWarn() throws Exception {
        var c=approved("Lifecycle failures"); isolate(c); var queued=submit(c);
        var aged=store.get("run",str(queued,"id")); aged.put("createdAt",Instant.now().minusSeconds(1000).toString()); store.save("run",aged); service.tick();
        assertEquals("BLOCKED",gate(queued).get("status")); assertTrue(number(gate(queued),"infrastructureFailures",0)>0);
        enroll(false); var assigned=submit(c); service.disconnect("gate-session"); assertEquals("BLOCKED",gate(assigned).get("status")); assertTrue(number(gate(assigned),"infrastructureFailures",0)>0);
        // Restart recovery is invoked on an existing active assignment exactly as initialize does at startup.
        var active=store.get("run",str(assigned,"id")); active.put("status","RUNNING"); active.remove("_gate"); active.remove("_gateExport"); active.remove("finishedAt"); store.save("run",active); service.initialize();
        assertEquals("BLOCKED",gate(assigned).get("status")); assertTrue(suite(assigned).getElementsByTagName("error").getLength()>0);
    }

    @Test void provenLegacyPassesUseStrictPolicyAndAmbiguousLegacyFailuresBlock() throws Exception {
        enroll(false); var c=approved("Historical result"); isolate(c); var pass=submit(c); done(pass,c,"PASSED");
        var failed=submit(c); done(failed,c,"FAILED");
        for(var run:List.of(pass,failed)) { var legacy=store.get("run",str(run,"id")); legacy.remove("_gateSubmission"); legacy.remove("_completion"); legacy.remove("_gate"); legacy.remove("_gateExport"); store.save("run",legacy); }
        var passGate=gate(pass); assertEquals("strict-legacy-v1",passGate.get("policy")); assertEquals("PASSED",passGate.get("status")); assertEquals(List.of(),passGate.get("quarantinedCaseIds")); counters(suite(pass),1,0,0,0);
        var failedGate=gate(failed); assertEquals("strict-legacy-v1",failedGate.get("policy")); assertEquals("BLOCKED",failedGate.get("status")); assertEquals(0,failedGate.get("quarantinedFailures")); counters(suite(failed),2,1,0,1);
        var ambiguous=store.get("run",str(pass,"id")); ambiguous.remove("_gate"); ambiguous.remove("_gateExport"); ambiguous.remove("completionReceived"); store.save("run",ambiguous);
        assertEquals("BLOCKED",gate(pass).get("status")); counters(suite(pass),2,0,0,1);
    }

    @Test void legacyCancelledLateCompletionCannotRetroactivelyProvePassedGate() throws Exception {
        enroll(false); var c=approved("Legacy late result"); var run=submit(c); service.cancelRun(str(run,"id"),"admin");
        var legacy=store.get("run",str(run,"id")); legacy.remove("_gateSubmission"); legacy.remove("_gate"); legacy.remove("_gateExport"); store.save("run",legacy);
        // No gate read before done: complete must freeze the old conservative facts first.
        done(run,c,"PASSED"); assertEquals("BLOCKED",gate(run).get("status")); assertEquals(0,gate(run).get("passed")); assertEquals(1,gate(run).get("blockingFailures"));
        assertEquals("strict-legacy-v1",gate(run).get("policy")); assertTrue(suite(run).getElementsByTagName("error").getLength()>0);
    }

    @Test void oldFailedRunWithAllPassingAssertionsStillBlocksWithoutCleanupProof() throws Exception {
        enroll(false); var c=approved("Old cleanup failure"); var run=submit(c); var done=message(run,List.of(result(c,"PASSED"))); done.put("cleanupOk",false); service.agentMessage("gate-session",done);
        var legacy=store.get("run",str(run,"id")); assertEquals("FAILED",legacy.get("status")); assertEquals(true,legacy.get("completionReceived"));
        legacy.remove("_gateSubmission"); legacy.remove("_completion"); legacy.remove("_gate"); legacy.remove("_gateExport"); store.save("run",legacy);
        var gate=gate(run); assertEquals("strict-legacy-v1",gate.get("policy")); assertEquals("BLOCKED",gate.get("status")); assertEquals(1,gate.get("passed")); assertEquals(0,gate.get("blockingFailures")); counters(suite(run),2,0,0,1);
        assertTrue(service.list("quality").isEmpty(),"Failed cleanup must not record an assertion quality sample");
    }

    @Test void matrixSharesSubmissionSnapshotAndAggregatesPendingWarnAndBlocked() throws Exception {
        enroll(true); var c=approved("Matrix isolation"); isolate(c); var matrix=matrix(c);
        assertEquals("aggregate-v1",cast(matrix.get("gate")).get("policy")); assertEquals("PENDING",cast(matrix.get("gate")).get("status"));
        service.releaseQuality(str(c,"id"),map("reason","Reviewed release after matrix submission"),"admin");
        var chrome=child(matrix,0); var firefox=child(matrix,1); assertEquals(gate(chrome).get("quarantinedCaseIds"),gate(firefox).get("quarantinedCaseIds")); done(chrome,c,"FAILED");
        assertEquals("PENDING",cast(service.matrix(str(matrix,"id")).get("gate")).get("status"));
        done(firefox,c,"FAILED"); var detail=service.matrix(str(matrix,"id")); var gate=cast(detail.get("gate")); assertEquals("FAILED",detail.get("status")); assertEquals("WARN",gate.get("status"));
        assertEquals(2,gate.get("total")); assertEquals(2,gate.get("quarantinedFailures")); assertEquals(List.of(c.get("id")),gate.get("quarantinedCaseIds"));
        var xml=xml(service.matrixGateJunit(str(matrix,"id"),"admin")); counters(xml,2,0,2,0); assertTrue(xml.getTextContent().contains("originalStatus=FAILED"));
        assertEquals(2,xml.getElementsByTagName("testsuite").getLength()); assertTrue(((Element)xml.getElementsByTagName("testsuite").item(0)).getAttribute("name").contains("Chromium"));
        String frozen=service.matrixGateJunit(str(matrix,"id"),"admin"); assertEquals(frozen,service.matrixGateJunit(str(matrix,"id"),"admin"));
        var next=matrix(c); done(child(next,0),c,"FAILED"); service.cancelRun(str(child(next,1),"id"),"admin");
        assertEquals("BLOCKED",cast(service.matrix(str(next,"id")).get("gate")).get("status")); assertTrue(xml(service.matrixGateJunit(str(next,"id"),"admin")).getElementsByTagName("error").getLength()>0);
        service.initialize(); assertEquals(frozen,service.matrixGateJunit(str(matrix,"id"),"admin"));
    }

    @Test void matrixKeepsPassedCountsAndXmlFrozenWhenOneTargetTimesOutThenCompletes() throws Exception {
        enroll(true); var c=approved("Matrix late completion"); var matrix=matrix(c); var chrome=child(matrix,0); var firefox=child(matrix,1); done(chrome,c,"PASSED");
        var aged=store.get("run",str(firefox,"id")); aged.put("assignedAt",Instant.now().minusSeconds(1000).toString()); store.save("run",aged); service.tick();
        var gate=cast(service.matrix(str(matrix,"id")).get("gate")); String before=service.matrixGateJunit(str(matrix,"id"),"admin"); done(firefox,c,"PASSED");
        assertEquals(2,cast(service.matrix(str(matrix,"id")).get("summary")).get("passed")); assertEquals(1,gate.get("passed"));
        assertEquals(gate,cast(service.matrix(str(matrix,"id")).get("gate"))); assertEquals(before,service.matrixGateJunit(str(matrix,"id"),"admin"));
    }

    @Test void gateReportEndpointsRequireLoginAllowAllRolesAndConflictWhileActive() throws Exception {
        var c=approved("Report permissions"); var run=submit(c); var matrix=matrix(c);
        for(String path:List.of("/api/runs/"+run.get("id")+"/gate-junit","/api/matrices/"+matrix.get("id")+"/gate-junit")) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
            mvc.perform(get(path).header("Authorization","Bearer "+str(service.login("admin","TestAdminPassword123!"),"token"))).andExpect(status().isConflict());
        }
        service.cancelRun(str(run,"id"),"admin"); service.cancelMatrix(str(matrix,"id"),"admin");
        for(String role:List.of("ADMIN","TESTER","DEVELOPER","VIEWER")) {
            String token=token(role);
            for(String path:List.of("/api/runs/"+run.get("id")+"/gate-junit","/api/matrices/"+matrix.get("id")+"/gate-junit")) mvc.perform(get(path).header("Authorization","Bearer "+token)).andExpect(status().isOk()).andExpect(content().contentTypeCompatibleWith("application/xml"));
            mvc.perform(get("/api/runs/"+run.get("id")).header("Authorization","Bearer "+token)).andExpect(jsonPath("$.gate.status").value("BLOCKED"));
            mvc.perform(get("/api/matrices/"+matrix.get("id")).header("Authorization","Bearer "+token)).andExpect(jsonPath("$.gate.status").value("BLOCKED")).andExpect(jsonPath("$.variants[0].gate.status").value("BLOCKED"));
        }
        String viewer=str(service.login("gate-viewer","GateReaderPassword123!"),"token");
        mvc.perform(post("/api/runs/"+run.get("id")+"/cancel").header("Authorization","Bearer "+viewer)).andExpect(status().isForbidden());
        mvc.perform(get("/api/runs/missing/gate-junit").header("Authorization","Bearer "+viewer)).andExpect(status().isNotFound());
        assertTrue(service.list("run").stream().allMatch(r->r.containsKey("gate"))); assertTrue(service.listMatrices().stream().allMatch(r->r.containsKey("gate")));
    }
}
