package com.smarttest.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.w3c.dom.Element;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import static com.smarttest.platform.PlatformService.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:matrixtest;MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "platform.admin-password=TestAdminPassword123!", "platform.evidence-path=target/test-matrix-evidence", "platform.scheduler-delay-ms=3600000"})
@AutoConfigureMockMvc
class MatrixIntegrationTest {
    @Autowired PlatformService service;
    @MockitoSpyBean DocumentStore store;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    final List<String> sessions=new ArrayList<>();
    final List<Map<String,Object>> sent=new ArrayList<>();
    @BeforeEach void reset() { jdbc.update("DELETE FROM platform_documents"); service.initialize(); service.transport((s,m)->sent.add(m),s->{}); }
    @AfterEach void disconnect() { for(String session:sessions)service.disconnect(session); }
    Map<String,Object> example(boolean sensitive) { return map("name","Approved <case> & \"browser\"","platform","web","framework","playwright","sensitive",sensitive,"steps",List.of(map("action","goto","target","https://example.org"))); }
    Map<String,Object> approved(boolean sensitive) { var c=service.createCase(example(sensitive),"admin"); return service.approveCase(str(c,"id"),number(c,"revision",0),"admin"); }
    Map<String,Object> plan(Map<String,Object> c) { return service.savePlan(null,map("name","Browser regression","caseIds",List.of(c.get("id")),"capabilities",map("platform","web")),"admin"); }
    Map<String,Object> variant(String label,String browser) { return map("label",label,"capabilities",map("browser",browser)); }
    Map<String,Object> input(Map<String,Object> plan) { return map("planId",plan.get("id"),"variants",List.of(variant("Chromium","chromium"),variant("Firefox","firefox"))); }
    Map<String,Object> create(Map<String,Object> plan) { return service.createMatrix(input(plan),"admin"); }
    Map<String,Object> run(Map<String,Object> matrix,int index) { return service.get("run",str(objects(matrix.get("variants")).get(index),"runId")); }
    Map<String,Object> target(String id,String browser,List<String> tags) { return map("id",id,"name",id,"platform","web","browser",browser,"version","131","provider","local","tags",tags,"status","IDLE","cleanupOk",true); }
    void enroll(String agent,String session,List<Map<String,Object>> targets) {
        var key=service.createKey(map("name",agent),"admin"); sessions.add(session);
        service.register(session,map("agentId",agent,"hostFingerprint","host-"+agent,"agentKey",key.get("key"),"targets",targets));
    }
    void complete(String session,Map<String,Object> run,Map<String,Object> c,String verdict,boolean cleaned) {
        service.agentMessage(session,map("type","done","taskId",run.get("id"),"results",List.of(map("caseId",c.get("id"),"status",verdict,"durationMs",15,"error",verdict.equals("PASSED")?"":"Failure <detail> & assertion","steps",List.of())),"logs",List.of("Actual result & log"),"cleanupOk",cleaned));
    }
    String token(String user,String password) { return str(service.login(user,password),"token"); }
    String adminToken() { return token("admin","TestAdminPassword123!"); }
    void noSideEffects(Map<String,Object> in) {
        int rows=jdbc.queryForObject("SELECT COUNT(*) FROM platform_documents",Integer.class),messages=sent.size();
        assertThrows(ApiException.class,()->service.createMatrix(in,"admin"));
        assertEquals(rows,jdbc.queryForObject("SELECT COUNT(*) FROM platform_documents",Integer.class),"Invalid matrix must not save runs, matrix or audit");
        assertEquals(messages,sent.size(),"Invalid matrix must not send assignments");
        assertTrue(store.list("matrix").isEmpty()); assertTrue(store.list("run").isEmpty());
    }
    @Test void everyVariantValidatesBeforeAnyWriteAuditOrAssignment() {
        enroll("a","s",List.of(target("chromium","chromium",List.of()))); var p=plan(approved(false));
        for(var invalid:List.of(variant("Later","safari"),map("label","Later","capabilities",map("provider","local")),
                map("label","Later","capabilities",map("browser","firefox","platform","android")),
                map("label","Later","capabilities",map("browser","firefox","provider","unknown")),
                map("label","Later","capabilities",map("browser","firefox","version",">=beta")),
                map("label","Later","capabilities",map("browser","firefox","tags",List.of(""))),
                map("label","Later","capabilities","invalid"))) {
            noSideEffects(map("planId",p.get("id"),"variants",List.of(variant("First","chromium"),invalid)));
        }
    }
    @Test void commitFailureRollsBackAllRecordsAndNeverDispatches() {
        enroll("a","s",List.of(target("chrome","chromium",List.of()),target("firefox","firefox",List.of()))); var p=plan(approved(false));
        int rows=jdbc.queryForObject("SELECT COUNT(*) FROM platform_documents",Integer.class),messages=sent.size();
        doAnswer(invocation->{
            invocation.callRealMethod();
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void beforeCommit(boolean readOnly) { throw new IllegalStateException("Simulated commit rejection"); }
            });
            return null;
        }).when(store).save(eq("matrix"),anyMap());
        try { assertThrows(IllegalStateException.class,()->create(p)); }
        finally { org.mockito.Mockito.reset(store); }
        assertEquals(rows,jdbc.queryForObject("SELECT COUNT(*) FROM platform_documents",Integer.class)); assertEquals(messages,sent.size());
        assertTrue(store.list("matrix").isEmpty()); assertTrue(store.list("run").isEmpty());
        assertEquals("IDLE",service.get("device","chrome").get("status")); assertEquals("IDLE",service.get("device","firefox").get("status"));
    }
    @Test void transportFailureAfterCommitUsesFreshTransactionToPersistInfrastructureFailure() {
        enroll("a","s",List.of(target("chrome","chromium",List.of()),target("firefox","firefox",List.of()))); var p=plan(approved(false));
        service.transport((s,m)->{if("assign".equals(m.get("type")))throw new IllegalStateException("Disconnected transport");},s->{});
        var matrix=create(p); var detail=service.matrix(str(matrix,"id")); assertEquals("FAILED",detail.get("status"));
        assertEquals(2,cast(detail.get("summary")).get("failedVariants")); assertEquals("MAINTENANCE",service.get("device","chrome").get("status"));
        assertTrue(service.list("audit").stream().anyMatch(a->"DISCONNECT_AGENT".equals(a.get("action"))));
    }
    @Test void qualityUsesActualEnvironmentHistoryAcrossInterleavedBrowserResults() {
        var c=approved(false); enroll("a","s",List.of(target("chrome","chromium",List.of()),target("firefox","firefox",List.of())));
        var in=input(plan(c)); in.put("commitSha","same-commit"); var matrix=service.createMatrix(in,"admin");
        complete("s",run(matrix,0),c,"PASSED",true); complete("s",run(matrix,1),c,"FAILED",true);
        var quality=service.get("quality",str(c,"id")); assertEquals(2,quality.get("executions")); assertEquals(false,quality.get("quarantined")); assertEquals(0.0,((Number)quality.get("ewmaScore")).doubleValue()); assertFalse(quality.containsKey("_environmentHistory"));
        var again=service.createRun(map("caseIds",List.of(c.get("id")),"commitSha","same-commit","capabilities",map("browser","chromium","version",">=100")),"admin");
        complete("s",again,c,"FAILED",true); quality=service.get("quality",str(c,"id"));
        assertEquals(3,quality.get("executions")); assertEquals(1,quality.get("passed")); assertEquals(2,quality.get("failed")); assertEquals(true,quality.get("quarantined")); assertEquals(0.2,((Number)quality.get("ewmaScore")).doubleValue());
        assertEquals(2,cast(store.get("quality",str(c,"id")).get("_environmentHistory")).size());
        service.releaseQuality(str(c,"id"),map("reason","Reviewed actual browser environment"),"admin");
        var newer=target("chrome","chromium",List.of()); newer.put("version","132");
        service.agentMessage("s",map("type","heartbeat","targets",List.of(newer,target("firefox","firefox",List.of()))));
        var differentVersion=service.createRun(map("caseIds",List.of(c.get("id")),"commitSha","same-commit","capabilities",map("browser","chromium","version",">=100")),"admin");
        complete("s",differentVersion,c,"PASSED",true); quality=service.get("quality",str(c,"id"));
        assertEquals(false,quality.get("quarantined")); assertEquals(0.2,((Number)quality.get("ewmaScore")).doubleValue()); assertEquals(3,cast(store.get("quality",str(c,"id")).get("_environmentHistory")).size());
    }
    @Test void duplicateLabelsAndNormalizedTargetsAreRejectedAtomically() {
        var p=plan(approved(false));
        noSideEffects(map("planId",p.get("id"),"variants",List.of(variant(" Chromium ","chromium"),variant("cHrOmIuM","firefox"))));
        noSideEffects(map("planId",p.get("id"),"variants",List.of(
                map("label","First","capabilities",map("browser","chromium","tags",List.of("a","b"),"version","131")),
                map("label","Second","capabilities",map("browser"," CHROMIUM ","tags",List.of("b","a","a"),"version","==0131.0")))));
    }
    @Test void blankBrandAndModelConstraintsNormalizeToMissingIncludingInheritedValues() throws Exception {
        enroll("a","s",List.of(target("chrome","chromium",List.of()))); var c=approved(false);
        var p=service.savePlan(null,map("name","Queued duplicate check","caseIds",List.of(c.get("id")),"capabilities",map("platform","web","version","0")),"admin");
        var reproduction=map("planId",p.get("id"),"variants",List.of(variant("base","chromium"),map("label","empty-brand","capabilities",map("browser","chromium","brand",""))));
        String token=adminToken(); int rows=jdbc.queryForObject("SELECT COUNT(*) FROM platform_documents",Integer.class),messages=sent.size();
        mvc.perform(post("/api/matrices").header("Authorization","Bearer "+token).contentType("application/json").content(json.writeValueAsString(reproduction))).andExpect(status().isBadRequest());
        assertEquals(rows,jdbc.queryForObject("SELECT COUNT(*) FROM platform_documents",Integer.class)); assertEquals(messages,sent.size());
        for(String brand:List.of(""," ","\t\n","\u2003")) for(String model:List.of(""," ","\t\n","\u2003")) {
            var empty=map("browser","chromium","brand",brand,"model",model);
            noSideEffects(map("planId",p.get("id"),"variants",List.of(variant("base","chromium"),map("label","blank","capabilities",empty))));
        }
        for(var inherited:List.of(map("brand",""),map("model","\t "),map("brand","\u2003","model",""))) {
            var caps=map("platform","web","version","0"); caps.putAll(inherited);
            p=service.savePlan(str(p,"id"),map("name","Inherited blank constraints","caseIds",List.of(c.get("id")),"capabilities",caps),"admin");
            noSideEffects(map("planId",p.get("id"),"variants",List.of(variant("inherited","chromium"),map("label","override","capabilities",map("browser","chromium","brand","\t","model","\u2003")))));
        }
        noSideEffects(map("planId",p.get("id"),"variants",List.of(map("label","empty","capabilities",map("browser","chromium","version","","brand","","model","")),map("label","whitespace","capabilities",map("browser","chromium","version","\t","brand","\u2003","model"," ")))));
    }
    @Test void boundsAndMissingWebPlanRejectWithoutRecords() {
        var p=plan(approved(false));
        noSideEffects(map("planId",p.get("id"),"variants",List.of(variant("Only","chromium"))));
        noSideEffects(map("planId",p.get("id"),"variants",java.util.stream.IntStream.range(0,9).mapToObj(i->variant("v"+i,"chromium")).toList()));
        for(String label:List.of(" ","x".repeat(81))) noSideEffects(map("planId",p.get("id"),"variants",List.of(variant("First","chromium"),variant(label,"firefox"))));
        var tooLong=input(p); tooLong.put("name","x".repeat(151)); noSideEffects(tooLong);
        tooLong=input(p); tooLong.put("commitSha","x".repeat(129)); noSideEffects(tooLong);
        var nonWeb=input(p); nonWeb.put("platform","android"); noSideEffects(nonWeb);
        noSideEffects(map("planId","plan-missing","variants",input(p).get("variants")));
        var mobile=service.savePlan(null,map("name","Mobile","caseIds",p.get("caseIds"),"capabilities",map("platform","android")),"admin"); noSideEffects(input(mobile));
    }
    @Test void changedApprovalOrNonWebCaseRejectsWholeBatch() {
        var c=approved(false); var draft=service.createCase(example(false),"admin");
        var p=service.savePlan(null,map("name","Review","caseIds",List.of(c.get("id"),draft.get("id"))),"admin"); noSideEffects(input(p));
        service.approveCase(str(draft,"id"),1,"admin"); service.updateCase(str(c,"id"),example(false),"admin"); noSideEffects(input(p));
        var mobile=example(false); mobile.put("platform","android"); mobile.put("framework","appium"); var m=service.createCase(mobile,"admin"); service.approveCase(str(m,"id"),1,"admin");
        p=service.savePlan(null,map("name","Wrong cases","caseIds",List.of(m.get("id")),"capabilities",map("platform","web")),"admin"); noSideEffects(input(p));
    }
    @Test void sensitiveCloudRejectsAndOnlyAdministratorTrustedLocalResourcesSchedule() {
        var c=approved(true); var p=plan(c); var in=input(p);
        in.put("variants",List.of(variant("Local","chromium"),map("label","Cloud","capabilities",map("browser","firefox","provider","cloud")))); noSideEffects(in);
        var cloudPlan=service.savePlan(null,map("name","Cloud default","caseIds",List.of(c.get("id")),"capabilities",map("platform","web","provider","cloud")),"admin"); noSideEffects(input(cloudPlan));
        enroll("a","s",List.of(target("chrome","chromium",List.of("trusted")),target("firefox","firefox",List.of("trusted"))));
        var matrix=create(p); assertEquals("QUEUED",matrix.get("status")); assertFalse(strings(service.get("device","chrome").get("tags")).contains("trusted"));
        service.updateDevice("chrome",map("tags",List.of("trusted")),"admin"); service.updateDevice("firefox",map("tags",List.of("trusted")),"admin"); service.tick();
        matrix=service.matrix(str(matrix,"id")); assertEquals("RUNNING",matrix.get("status"));
        for(var v:objects(matrix.get("variants"))) { assertEquals("ASSIGNED",v.get("status")); assertEquals("local",cast(v.get("deviceFingerprint")).get("provider")); }
    }
    @Test void creationInheritsPlanAndSharesSnapshotsBeforeSingleSchedulerPass() {
        var c=approved(false); var p=service.savePlan(null,map("name","n".repeat(200),"caseIds",List.of(c.get("id")),"priority",72,"queueTimeoutSeconds",43,"executionTimeoutSeconds",84,
                "capabilities",map("platform","web","provider","local","tags",List.of("ci"),"version",">=131")),"admin");
        enroll("a","s",List.of(target("chrome","chromium",List.of("ci")),target("firefox","firefox",List.of("ci"))));
        AtomicInteger assignments=new AtomicInteger(); service.transport((s,m)->{if("assign".equals(m.get("type"))) {assertEquals(1,store.list("matrix").size());assertEquals(2,store.list("run").size());assignments.incrementAndGet();}},s->{});
        var in=input(p); in.put("commitSha","abc123"); var matrix=service.createMatrix(in,"admin"); assertEquals(2,assignments.get()); assertEquals(150,str(matrix,"name").length());
        for(int i=0;i<2;i++) { var r=store.get("run",str(run(matrix,i),"id"));
            assertEquals(matrix.get("id"),r.get("matrixId")); assertEquals(i==0?"Chromium":"Firefox",r.get("matrixLabel")); assertTrue(str(r,"name").length()<=200);
            assertEquals(72,r.get("priority")); assertEquals(43,r.get("queueTimeoutSeconds")); assertEquals(84,r.get("executionTimeoutSeconds")); assertEquals("abc123",r.get("commitSha"));
            assertEquals(List.of("ci"),cast(r.get("capabilities")).get("tags")); assertEquals(c,objects(r.get("_cases")).getFirst());
        }
        assertEquals(store.get("run",str(run(matrix,0),"id")).get("_cases"),store.get("run",str(run(matrix,1),"id")).get("_cases"));
        assertEquals("RUNNING",matrix.get("status")); assertTrue(service.list("audit").stream().anyMatch(a->"CREATE_MATRIX".equals(a.get("action"))));
    }
    @Test void longestLabelsAreRetainedAndEightDistinctTargetsAreAccepted() {
        var p=plan(approved(false)); String label="L".repeat(80); var in=input(p); in.put("name","N".repeat(150));
        in.put("variants",List.of(variant(label,"chromium"),variant("F".repeat(80),"firefox"))); var matrix=service.createMatrix(in,"admin");
        assertEquals(200,str(run(matrix,0),"name").length()); assertTrue(str(run(matrix,0),"name").endsWith(" ["+label+"]"));
        var variants=java.util.stream.IntStream.range(1,9).mapToObj(i->map("label","Version "+i,"capabilities",map("browser","chromium","version",">="+i))).toList();
        var eight=service.createMatrix(map("planId",p.get("id"),"variants",variants),"admin"); assertEquals(8,objects(eight.get("variants")).size()); assertEquals(8,cast(eight.get("summary")).get("totalVariants"));
    }
    @Test void validatedChildVerdictsPassingProducesPassedMatrixAndSeparateSuites() throws Exception {
        var c=approved(false); enroll("a","s",List.of(target("chrome","chromium",List.of()),target("firefox","firefox",List.of()))); var matrix=create(plan(c));
        complete("s",run(matrix,0),c,"PASSED",true); complete("s",run(matrix,1),c,"PASSED",true);
        var detail=service.matrix(str(matrix,"id")); assertEquals("PASSED",detail.get("status")); assertEquals(2,cast(detail.get("summary")).get("passedVariants"));
        assertCounts(parse(service.matrixJunit(str(matrix,"id"),"admin")),2,0,0);
    }
    @Test void queuedAndPartiallyCompletedMatricesNeverClaimPassAndActiveExportConflicts() throws Exception {
        var c=approved(false); var matrix=create(plan(c)); String id=str(matrix,"id"); assertEquals("QUEUED",matrix.get("status"));
        mvc.perform(get("/api/matrices/"+id+"/junit").header("Authorization","Bearer "+adminToken())).andExpect(status().isConflict());
        enroll("a","s",List.of(target("chrome","chromium",List.of()))); service.tick(); assertEquals("RUNNING",service.matrix(id).get("status"));
        complete("s",run(matrix,0),c,"PASSED",true); var partial=service.matrix(id); assertEquals("RUNNING",partial.get("status"));
        assertEquals(1,cast(partial.get("summary")).get("passedVariants")); assertEquals(1,cast(partial.get("summary")).get("completedVariants"));
        assertThrows(ApiException.class,()->service.matrixJunit(id,"admin")); assertFalse(service.list("audit").stream().anyMatch(a->"EXPORT_MATRIX_JUNIT".equals(a.get("action"))));
    }
    @Test void mixedVerdictsAndInfrastructureCleanupFailureArePreservedInValidCountedXml() throws Exception {
        var c=approved(false); enroll("a","s",List.of(target("chrome","chromium",List.of()),target("firefox","firefox",List.of())));
        var p=plan(c); var in=input(p); in.put("name","Matrix < & \"report\" \u0000 \uffff"); var matrix=service.createMatrix(in,"admin");
        complete("s",run(matrix,0),c,"PASSED",true); complete("s",run(matrix,1),c,"PASSED",false);
        var detail=service.matrix(str(matrix,"id")); assertEquals("FAILED",detail.get("status")); assertEquals(1,cast(detail.get("summary")).get("failedVariants"));
        assertEquals(2,cast(detail.get("summary")).get("passed")); assertEquals(0,cast(detail.get("summary")).get("failed"));
        Element root=parse(service.matrixJunit(str(matrix,"id"),"admin")); assertEquals("testsuites",root.getTagName()); assertCounts(root,3,0,1);
        assertEquals(2,root.getElementsByTagName("testsuite").getLength());
        assertTrue(((Element)root.getElementsByTagName("testsuite").item(0)).getAttribute("name").contains("Chromium"));
        assertTrue(((Element)root.getElementsByTagName("testsuite").item(1)).getAttribute("name").contains("Firefox"));
        assertTrue(root.getElementsByTagName("error").item(0).getAttributes().getNamedItem("message").getNodeValue().contains("cleanup failed"));
    }
    @Test void caseFailureAndQueueTimeoutAggregateAsFailedWithRealCounts() throws Exception {
        var c=approved(false); enroll("a","s",List.of(target("chrome","chromium",List.of()))); var matrix=create(plan(c));
        complete("s",run(matrix,0),c,"FAILED",true); assertEquals("RUNNING",service.matrix(str(matrix,"id")).get("status"));
        var queued=store.get("run",str(run(matrix,1),"id")); queued.put("createdAt",Instant.now().minusSeconds(1000).toString()); store.save("run",queued); service.tick();
        var detail=service.matrix(str(matrix,"id")); assertEquals("FAILED",detail.get("status")); assertEquals(2,cast(detail.get("summary")).get("failedVariants")); assertEquals(1,cast(detail.get("summary")).get("failed"));
        assertCounts(parse(service.matrixJunit(str(matrix,"id"),"admin")),2,1,1); assertTrue(service.matrixJunit(str(matrix,"id"),"admin").contains("Queue timeout"));
    }
    @Test void cancelOnlyActiveChildrenAndRepeatDoesNotSendOrAuditAgain() throws Exception {
        var c=approved(false); enroll("a","s",List.of(target("chrome","chromium",List.of()),target("firefox","firefox",List.of()))); var matrix=create(plan(c));
        complete("s",run(matrix,0),c,"PASSED",true); String id=str(matrix,"id"); var cancelled=service.cancelMatrix(id,"admin");
        assertEquals("CANCELLED",cancelled.get("status")); assertEquals("PASSED",run(cancelled,0).get("status")); assertEquals("CANCELLED",run(cancelled,1).get("status")); assertEquals("CLEANING",service.get("device","firefox").get("status"));
        int audits=store.list("audit").size(),messages=sent.size(); assertEquals(cancelled,service.cancelMatrix(id,"admin")); assertEquals(audits,store.list("audit").size()); assertEquals(messages,sent.size());
        complete("s",run(matrix,1),c,"PASSED",true); assertEquals("IDLE",service.get("device","firefox").get("status")); assertEquals("CANCELLED",service.matrix(id).get("status"));
        assertCounts(parse(service.matrixJunit(id,"admin")),3,0,1);
    }
    @Test void failedChildTakesPrecedenceOverCancellationAndQueuedCancelNeedsNoResource() {
        var c=approved(false); enroll("a","s",List.of(target("chrome","chromium",List.of()))); var matrix=create(plan(c));
        complete("s",run(matrix,0),c,"FAILED",true); var cancelled=service.cancelMatrix(str(matrix,"id"),"admin");
        assertEquals("FAILED",cancelled.get("status")); assertEquals("CANCELLED",run(cancelled,1).get("status")); assertFalse(run(cancelled,1).containsKey("deviceId"));
    }
    @Test void viewerReadsExportsButCannotMutateAndAnonymousCannotAccess() throws Exception {
        var p=plan(approved(false)); var matrix=create(p); String id=str(matrix,"id");
        service.createUser(map("username","viewer","password","ViewerPassword123!","role","VIEWER"),"admin"); String viewer=token("viewer","ViewerPassword123!");
        mvc.perform(get("/api/matrices").header("Authorization","Bearer "+viewer)).andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(id));
        mvc.perform(get("/api/matrices/"+id).header("Authorization","Bearer "+viewer)).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("QUEUED"));
        mvc.perform(post("/api/matrices").header("Authorization","Bearer "+viewer).contentType("application/json").content(json.writeValueAsString(input(p)))).andExpect(status().isForbidden());
        mvc.perform(post("/api/matrices/"+id+"/cancel").header("Authorization","Bearer "+viewer)).andExpect(status().isForbidden()); assertEquals("QUEUED",service.matrix(id).get("status"));
        mvc.perform(get("/api/matrices")).andExpect(status().isUnauthorized()); mvc.perform(get("/api/matrices/"+id)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/matrices/"+id+"/junit")).andExpect(status().isUnauthorized()); mvc.perform(post("/api/matrices/"+id+"/cancel")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/matrices").contentType("application/json").content(json.writeValueAsString(input(p)))).andExpect(status().isUnauthorized());
        service.cancelMatrix(id,"admin"); mvc.perform(get("/api/matrices/"+id+"/junit").header("Authorization","Bearer "+viewer)).andExpect(status().isOk()).andExpect(content().contentTypeCompatibleWith("application/xml"));
        assertTrue(service.list("audit").stream().anyMatch(a->"EXPORT_MATRIX_JUNIT".equals(a.get("action"))&&"viewer".equals(a.get("actor"))));
    }
    @Test void writerRolesCanCreateAndCancelViaRest() throws Exception {
        var p=plan(approved(false));
        for(String role:List.of("ADMIN","TESTER","DEVELOPER")) {
            String t;
            if(role.equals("ADMIN")) t=adminToken(); else { String user=role.toLowerCase(Locale.ROOT); service.createUser(map("username",user,"password","WriterPassword123!","role",role),"admin"); t=token(user,"WriterPassword123!"); }
            var response=mvc.perform(post("/api/matrices").header("Authorization","Bearer "+t).contentType("application/json").content(json.writeValueAsString(input(p)))).andExpect(status().isOk()).andExpect(jsonPath("$.variants.length()").value(2)).andReturn();
            String id=json.readTree(response.getResponse().getContentAsString()).get("id").asText();
            mvc.perform(post("/api/matrices/"+id+"/cancel").header("Authorization","Bearer "+t)).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        }
    }
    @Test void snapshotsAndReportsSurvivePlanDeletionCaseEditingAndServiceReload() throws Exception {
        var c=approved(false); var p=plan(c); var matrix=create(p); String id=str(matrix,"id");
        var edit=example(false); edit.put("name","New unapproved name"); service.updateCase(str(c,"id"),edit,"admin"); service.deletePlan(str(p,"id"),"admin"); service.deleteCase(str(c,"id"),"admin");
        for(int i=0;i<2;i++) assertEquals(c,objects(store.get("run",str(run(matrix,i),"id")).get("_cases")).getFirst());
        service.cancelMatrix(id,"admin"); String before=service.matrixJunit(id,"admin");
        var reloaded=new PlatformService(store); ReflectionTestUtils.setField(reloaded,"adminPassword","TestAdminPassword123!"); ReflectionTestUtils.setField(reloaded,"evidencePath","target/test-matrix-evidence"); reloaded.initialize();
        assertEquals(service.matrix(id),reloaded.matrix(id)); assertEquals(before,reloaded.matrixJunit(id,"admin")); assertEquals(1,reloaded.listMatrices().size());
    }
    @Test void wallClockDurationIsFrozenAtLatestFinishAndListUsesInstantOrder() {
        var p=plan(approved(false)); var earlier=create(p); var later=create(p); Instant start=Instant.parse("2026-01-01T00:00:00.012Z");
        var first=store.get("matrix",str(earlier,"id")); first.put("createdAt",start.toString()); store.save("matrix",first);
        var second=store.get("matrix",str(later,"id")); second.put("createdAt",start.plusNanos(345000).toString()); store.save("matrix",second);
        for(int i=0;i<2;i++) { var r=store.get("run",str(run(earlier,i),"id")); r.put("status","PASSED"); r.put("finishedAt",start.plusMillis(150+i*750).toString()); store.save("run",r); }
        assertEquals("PASSED",service.matrix(str(earlier,"id")).get("status")); assertEquals(900L,cast(service.matrix(str(earlier,"id")).get("summary")).get("durationMs"));
        assertEquals(later.get("id"),service.listMatrices().getFirst().get("id"));
    }
    Element parse(String xml) throws Exception { return javax.xml.parsers.DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8))).getDocumentElement(); }
    void assertCounts(Element root,int tests,int failures,int errors) {
        assertEquals(String.valueOf(tests),root.getAttribute("tests")); assertEquals(tests,root.getElementsByTagName("testcase").getLength());
        assertEquals(String.valueOf(failures),root.getAttribute("failures")); assertEquals(failures,root.getElementsByTagName("failure").getLength());
        assertEquals(String.valueOf(errors),root.getAttribute("errors")); assertEquals(errors,root.getElementsByTagName("error").getLength());
        int suiteTests=0,suiteFailures=0,suiteErrors=0;
        for(int i=0;i<root.getElementsByTagName("testsuite").getLength();i++) { var suite=(Element)root.getElementsByTagName("testsuite").item(i); suiteTests+=Integer.parseInt(suite.getAttribute("tests"));suiteFailures+=Integer.parseInt(suite.getAttribute("failures"));suiteErrors+=Integer.parseInt(suite.getAttribute("errors")); }
        assertEquals(tests,suiteTests); assertEquals(failures,suiteFailures); assertEquals(errors,suiteErrors);
    }
}
