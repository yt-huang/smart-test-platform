package com.smarttest.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import java.io.InputStream;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import static com.smarttest.platform.PlatformService.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Boundary fixtures exercise the protocol; they do not claim real browser execution. */
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:timelinetest;MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "platform.admin-password=TestAdminPassword123!", "platform.evidence-path=target/test-timeline-evidence", "platform.scheduler-delay-ms=3600000"})
@AutoConfigureMockMvc
class TimelineIntegrationTest {
    @Autowired PlatformService service;
    @MockitoSpyBean DocumentStore store;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    Map<String,Object> key;
    boolean enrolled;
    final Path evidenceRoot=Path.of("target/test-timeline-evidence").toAbsolutePath();

    @BeforeEach void reset() {
        jdbc.update("DELETE FROM platform_documents"); service.initialize(); service.transport((s,m)->{},s->{});
        enrolled=false;
    }
    @AfterEach void disconnect() { org.mockito.Mockito.reset(store); if(enrolled) service.disconnect("timeline-session"); }
    Map<String,Object> approved(String name) {
        var c=service.createCase(map("name",name,"steps",List.of(map("action","goto","target","https://example.org"))),"admin");
        return service.approveCase(str(c,"id"),number(c,"revision",0),"admin");
    }
    void enroll() {
        key=service.createKey(map("name","Timeline fixture"),"admin");
        service.register("timeline-session",map("agentId","timeline-agent","hostFingerprint","timeline-fixture-host","agentKey",key.get("key"),"targets",List.of(map("id","timeline-browser","platform","web","browser","chromium","version","131","provider","local","status","IDLE","cleanupOk",true))));
        enrolled=true;
    }
    @SafeVarargs final Map<String,Object> submit(Map<String,Object>... cases) { return service.createRun(map("name","Comparable report","caseIds",Arrays.stream(cases).map(c->c.get("id")).toList()),"admin"); }
    Map<String,Object> result(Map<String,Object> c) { return map("caseId",c.get("id"),"status","FAILED","durationMs",15,"error","Actual fixture assertion","steps",List.of(),"evidence",List.of()); }
    Map<String,Object> timing(Instant start,Instant finish) { return map("startedAt",start.toString(),"finishedAt",finish.toString()); }
    Map<String,Object> validTiming() { var current=Instant.now(); return timing(current.minusSeconds(4),current.minusSeconds(1)); }
    Map<String,Object> capture(String kind,Map<String,Object> c,Map<String,Object> timing) {
        var input=map("kind",kind); if(c!=null) input.put("caseId",c.get("id")); input.putAll(timing); return input;
    }
    MockMultipartFile file(String kind) {
        return new MockMultipartFile("file",kind+".fixture",switch(kind) {case "screenshot"->"image/png";case "video"->"video/webm";case "trace"->"application/zip";default->"text/plain";},new byte[]{1,2,3,4});
    }
    Map<String,Object> upload(Map<String,Object> run,String kind,Map<String,Object> c,Map<String,Object> timing) throws Exception {
        return service.uploadEvidence(str(key,"key"),str(run,"id"),file(kind),json.writeValueAsString(capture(kind,c,timing)));
    }
    void done(Map<String,Object> run,List<Map<String,Object>> results) {
        service.agentMessage("timeline-session",map("type","done","taskId",run.get("id"),"results",results,"cleanupOk",true,"logs",List.of("2026-10-12T00:00:00.000Z unchanged fixture log")));
    }
    Set<Path> files() throws Exception { try(var paths=Files.list(evidenceRoot)) { return new HashSet<>(paths.toList()); } }
    String sha(Path path) throws Exception { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(path))); }
    void rejectedDone(Map<String,Object> run,List<Map<String,Object>> results,HttpStatus expected) {
        var before=store.get("run",str(run,"id")); var beforeDevice=store.get("device","timeline-browser");
        var beforeQuality=store.list("quality"); int auditCount=store.list("audit").size();
        assertEquals(expected,assertThrows(ApiException.class,()->done(run,results)).status);
        assertEquals(before,store.get("run",str(run,"id"))); assertEquals(beforeDevice,store.get("device","timeline-browser"));
        assertEquals(beforeQuality,store.list("quality")); assertEquals(auditCount,store.list("audit").size());
    }
    void rejectedUpload(Map<String,Object> run,MockMultipartFile file,String capture,HttpStatus expected) throws Exception {
        var beforeFiles=files(); int records=store.list("evidence").size(),audits=store.list("audit").size();
        assertEquals(expected,assertThrows(ApiException.class,()->service.uploadEvidence(str(key,"key"),str(run,"id"),file,capture)).status);
        assertEquals(beforeFiles,files()); assertEquals(records,store.list("evidence").size()); assertEquals(audits,store.list("audit").size());
    }

    @Test void multipartCapturePersistsWhitelistAndApprovedSnapshotWithOriginalOffsets() throws Exception {
        enroll(); var c=approved("Snapshot owner"); var run=submit(c);
        service.updateCase(str(c,"id"),map("name","Unapproved edit","steps",List.of(map("action","goto","target","https://example.org/new"))),"admin");
        var interval=validTiming(); interval.put("startedAt",OffsetDateTime.ofInstant(Instant.parse(str(interval,"startedAt")),ZoneOffset.ofHours(8)).toString());
        var input=capture("screenshot",c,interval); input.put("path","ignored-private-path"); input.put("durationMs",999); input.put("unknown",Map.of("nested",true));
        var response=mvc.perform(multipart("/api/agent/evidence").file(file("screenshot")).param("taskId",str(run,"id")).param("capture",json.writeValueAsString(input)).header("X-Agent-Key",str(key,"key"))).andExpect(status().isOk()).andReturn();
        var stored=json.readValue(response.getResponse().getContentAsString(),new TypeReference<LinkedHashMap<String,Object>>(){});
        assertEquals(capture("screenshot",c,interval),stored.get("capture")); assertFalse(stored.containsKey("path"));
        assertEquals(stored.get("capture"),store.get("evidence",str(stored,"id")).get("capture"));
        assertTrue(Instant.parse(str(stored,"createdAt")).isAfter(Instant.parse(str(interval,"finishedAt"))));
        for(String kind:List.of("video","trace","log")) assertEquals(kind,cast(upload(run,kind,kind.equals("log")?null:c,interval).get("capture")).get("kind"));
    }

    @Test void malformedAndOversizedCaptureRejectBeforeOpeningFileOrWritingIndex() throws Exception {
        enroll(); var c=approved("Malformed upload"); var run=submit(c); AtomicBoolean opened=new AtomicBoolean();
        var tracked=new MockMultipartFile("file","capture.png","image/png",new byte[]{1}) {
            @Override public InputStream getInputStream() throws java.io.IOException { opened.set(true); return super.getInputStream(); }
        };
        for(String source:List.of("", "{", "[]", "null", "\"string\"", "{} {}", "x".repeat(4001))) rejectedUpload(run,tracked,source,HttpStatus.BAD_REQUEST);
        assertFalse(opened.get(),"Rejected metadata must not read or copy evidence bytes");
    }

    @Test void invalidCaptureTimesAndClockWindowRejectWithoutFileOrIndex() throws Exception {
        enroll(); var c=approved("Time boundaries"); var run=submit(c); var valid=validTiming();
        var invalid=new ArrayList<Map<String,Object>>();
        invalid.add(map("startedAt",valid.get("startedAt")));
        invalid.add(map("startedAt",null,"finishedAt",valid.get("finishedAt")));
        invalid.add(map("startedAt",17,"finishedAt",valid.get("finishedAt")));
        invalid.add(map("startedAt","2026-10-12T00:00:00","finishedAt",valid.get("finishedAt")));
        invalid.add(map("startedAt","2026-02-30T00:00:00Z","finishedAt",valid.get("finishedAt")));
        invalid.add(timing(Instant.now(),Instant.now().minusSeconds(1)));
        invalid.add(timing(Instant.now().plusSeconds(301),Instant.now().plusSeconds(302)));
        var tooOld=Instant.parse(str(store.get("run",str(run,"id")),"assignedAt")).minusSeconds(301);
        invalid.add(timing(tooOld,tooOld.plusSeconds(1)));
        for(var interval:invalid) rejectedUpload(run,file("screenshot"),json.writeValueAsString(capture("screenshot",c,interval)),HttpStatus.BAD_REQUEST);
    }

    @Test void captureRequiresMatchingMimeAndCaseInTaskSnapshot() throws Exception {
        enroll(); var c=approved("Owner"); var outsider=approved("Outside task"); var run=submit(c); var interval=validTiming();
        for(String kind:List.of("screenshot","video","trace")) {
            rejectedUpload(run,file(kind),json.writeValueAsString(capture(kind,null,interval)),HttpStatus.BAD_REQUEST);
            rejectedUpload(run,file(kind),json.writeValueAsString(capture(kind,outsider,interval)),HttpStatus.FORBIDDEN);
        }
        rejectedUpload(run,file("log"),json.writeValueAsString(capture("log",outsider,interval)),HttpStatus.FORBIDDEN);
        for(String kind:List.of("video","trace","log")) rejectedUpload(run,file("screenshot"),json.writeValueAsString(capture(kind,c,interval)),HttpStatus.BAD_REQUEST);
        for(String mime:List.of("not-a-mime","image/*","application/octet-stream")) rejectedUpload(run,new MockMultipartFile("file","bad",""+mime,new byte[]{1}),json.writeValueAsString(capture("screenshot",c,interval)),HttpStatus.BAD_REQUEST);
        rejectedUpload(run,file("screenshot"),json.writeValueAsString(capture("unknown",c,interval)),HttpStatus.BAD_REQUEST);
    }

    @Test void evidenceIndexFailureRollsBackCopiedFile() throws Exception {
        enroll(); var c=approved("Rollback"); var run=submit(c); var before=files();
        doThrow(new IllegalStateException("Injected evidence index failure")).when(store).save(eq("evidence"),anyMap());
        assertThrows(IllegalStateException.class,()->upload(run,"screenshot",c,validTiming()));
        assertEquals(before,files()); assertTrue(store.list("evidence").isEmpty());
    }

    @Test void doneRetainsCaseStepAndCaptureTimesAcrossReloadWithMediaHashAndAuthentication() throws Exception {
        enroll(); var c=approved("Retained timeline"); var run=submit(c); var interval=validTiming();
        var evidence=upload(run,"screenshot",c,interval); var result=result(c);
        var caseTiming=new LinkedHashMap<>(interval); caseTiming.put("unknown",true); result.put("timing",caseTiming);
        var stepTiming=new LinkedHashMap<>(interval); stepTiming.put("ignored","discard");
        result.put("steps",List.of(map("action","expectVisible","status","FAILED","timing",stepTiming,"error","Actual fixture assertion")));
        result.put("evidence",List.of(map("id",evidence.get("id"),"capture",map("kind","log")))); done(run,List.of(result));
        var actual=objects(service.get("run",str(run,"id")).get("results")).getFirst();
        assertEquals(interval,actual.get("timing")); assertEquals(interval,objects(actual.get("steps")).getFirst().get("timing"));
        assertEquals(evidence.get("capture"),objects(actual.get("evidence")).getFirst().get("capture"),"Persisted metadata overrides untrusted reference fields");
        Path path=Path.of(str(store.get("evidence",str(evidence,"id")),"path")); String hash=sha(path); var archived=service.get("run",str(run,"id"));
        service.initialize(); assertEquals(archived,service.get("run",str(run,"id"))); assertEquals(hash,sha(path));
        mvc.perform(get(str(evidence,"url"))).andExpect(status().isUnauthorized());
        service.createUser(map("username","timeline-viewer","password","TimelineViewerPass123!","role","VIEWER"),"admin");
        String token=str(service.login("timeline-viewer","TimelineViewerPass123!"),"token");
        mvc.perform(get(str(evidence,"url")).header("Authorization","Bearer "+token)).andExpect(status().isOk()).andExpect(content().bytes(new byte[]{1,2,3,4}));
        mvc.perform(post("/api/runs/"+run.get("id")+"/cancel").header("Authorization","Bearer "+token)).andExpect(status().isForbidden());
    }

    @Test void invalidCaseTimingRejectsAllResultsWithoutPartialRunLogsOrQualityWrites() {
        enroll(); var first=approved("First valid"); var second=approved("Second invalid"); var run=submit(first,second);
        var valid=result(first); valid.put("timing",validTiming()); var interval=validTiming();
        var invalid=Arrays.asList(null,"not an object",Map.of(),map("startedAt",interval.get("startedAt")),map("startedAt",interval.get("startedAt"),"finishedAt","invalid"),map("startedAt",interval.get("finishedAt"),"finishedAt",interval.get("startedAt")),timing(Instant.now().plusSeconds(301),Instant.now().plusSeconds(302)),timing(Instant.parse(str(run,"assignedAt")).minusSeconds(301),Instant.parse(str(run,"assignedAt")).minusSeconds(300)));
        for(Object value:invalid) { var bad=result(second); bad.put("timing",value); rejectedDone(run,List.of(valid,bad),HttpStatus.BAD_REQUEST); }
    }

    @Test void stepTimingRequiresCaseAndContainedValidInterval() {
        enroll(); var c=approved("Step boundary"); var run=submit(c); var interval=validTiming(); var result=result(c);
        result.put("steps",List.of(map("action","click","timing",interval)));
        rejectedDone(run,List.of(result),HttpStatus.BAD_REQUEST);
        result.put("timing",interval);
        for(Object stepTiming:Arrays.asList(null,"invalid",map("startedAt",interval.get("startedAt")),map("startedAt",interval.get("finishedAt"),"finishedAt",interval.get("startedAt")),timing(Instant.parse(str(interval,"startedAt")).minusNanos(1),Instant.parse(str(interval,"finishedAt"))),timing(Instant.parse(str(interval,"startedAt")),Instant.parse(str(interval,"finishedAt")).plusNanos(1)))) {
            result.put("steps",List.of(map("action","click","timing",stepTiming))); rejectedDone(run,List.of(result),HttpStatus.BAD_REQUEST);
        }
    }

    @Test void anyCapturedCaseReferenceCannotCrossCasesEvenWithoutResultTiming() throws Exception {
        enroll(); var owner=approved("Owner"); var other=approved("Other"); var run=submit(owner,other);
        for(String kind:List.of("screenshot","video","trace","log")) {
            var evidence=upload(run,kind,owner,validTiming()); var result=result(other); result.put("evidence",List.of(evidence));
            rejectedDone(run,List.of(result(owner),result),HttpStatus.FORBIDDEN);
        }
    }

    @Test void screenshotVideoAndTraceMustFitCaseWhenCaseHasTiming() throws Exception {
        enroll(); var c=approved("Capture boundary"); var run=submit(c); var interval=validTiming();
        Instant start=Instant.parse(str(interval,"startedAt")),finish=Instant.parse(str(interval,"finishedAt"));
        for(String kind:List.of("screenshot","video","trace")) {
            for(var captureTiming:List.of(timing(start.minusNanos(1),finish),timing(start,finish.plusNanos(1)))) {
                var evidence=upload(run,kind,c,captureTiming); var result=result(c); result.put("timing",interval); result.put("evidence",List.of(evidence));
                rejectedDone(run,List.of(result),HttpStatus.BAD_REQUEST);
            }
        }
    }

    @Test void sharedAndCaseLogsMaySpanCaseTiming() throws Exception {
        enroll(); var c=approved("Log span"); var run=submit(c); var interval=validTiming();
        var spanning=timing(Instant.parse(str(interval,"startedAt")).minusSeconds(2),Instant.parse(str(interval,"finishedAt")).plusSeconds(1));
        var shared=upload(run,"log",null,spanning); var scoped=upload(run,"log",c,spanning); var result=result(c);
        result.put("timing",interval); result.put("evidence",List.of(shared,scoped)); done(run,List.of(result));
        assertEquals(2,objects(objects(service.get("run",str(run,"id")).get("results")).getFirst().get("evidence")).size());
    }

    @Test void legacyThreeArgumentUploadAndUntimedDoneRemainUnchangedWithoutInventedTimes() {
        enroll(); var c=approved("Legacy"); var run=submit(c); var evidence=service.uploadEvidence(str(key,"key"),str(run,"id"),file("screenshot"));
        assertFalse(evidence.containsKey("capture")); var result=result(c); result.put("evidence",List.of(evidence)); result.put("steps",List.of(map("status","FAILED","durationMs",15)));
        done(run,List.of(result)); var actual=objects(service.get("run",str(run,"id")).get("results")).getFirst();
        assertFalse(actual.containsKey("timing")); assertFalse(objects(actual.get("steps")).getFirst().containsKey("timing"));
        assertFalse(objects(actual.get("evidence")).getFirst().containsKey("capture"));
    }

    @Test void timingDoesNotChangeOriginalOrGateJUnitBytes() {
        enroll(); var c=approved("Export parity"); var legacy=submit(c); done(legacy,List.of(result(c)));
        String original=service.junit(str(legacy,"id")),gate=service.gateJunit(str(legacy,"id"),"admin");
        var timed=submit(c); var result=result(c); result.put("timing",validTiming()); result.put("steps",List.of(map("status","FAILED","timing",result.get("timing")))); done(timed,List.of(result));
        assertEquals(original,service.junit(str(timed,"id"))); assertEquals(gate,service.gateJunit(str(timed,"id"),"admin"));
        assertFalse(service.gateJunit(str(timed,"id"),"admin").contains("startedAt"));
    }

    @Test void lateTimedCompletionRetainsFrozenGateAndRejectsInvalidTimingAtomically() {
        enroll(); var c=approved("Late timeline"); var run=submit(c); service.cancelRun(str(run,"id"),"admin");
        String frozen=service.gateJunit(str(run,"id"),"admin"); var gate=service.get("run",str(run,"id")).get("gate");
        var invalid=result(c); invalid.put("timing",map("startedAt","missing-offset","finishedAt",now())); rejectedDone(run,List.of(invalid),HttpStatus.BAD_REQUEST);
        var result=result(c); result.put("timing",validTiming()); done(run,List.of(result));
        assertEquals("CANCELLED",service.get("run",str(run,"id")).get("status")); assertEquals(gate,service.get("run",str(run,"id")).get("gate"));
        assertEquals(frozen,service.gateJunit(str(run,"id"),"admin")); assertEquals(result.get("timing"),objects(service.get("run",str(run,"id")).get("results")).getFirst().get("timing"));
    }

    @Test void exactLowerWindowBoundaryAndPositiveOffsetIntervalsAreAccepted() throws Exception {
        enroll(); var c=approved("Inclusive boundary"); var run=submit(c);
        Instant earliest=Instant.parse(str(run,"assignedAt")).minusSeconds(300),latest=Instant.now().plusSeconds(300);
        var interval=timing(earliest,latest); var evidence=upload(run,"screenshot",c,timing(earliest,earliest));
        var result=result(c); result.put("timing",interval); result.put("steps",List.of(map("timing",timing(earliest,earliest)))); result.put("evidence",List.of(evidence));
        done(run,List.of(result)); assertEquals(interval,objects(service.get("run",str(run,"id")).get("results")).getFirst().get("timing"));
    }
}
