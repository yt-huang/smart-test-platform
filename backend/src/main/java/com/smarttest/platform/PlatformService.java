package com.smarttest.platform;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.HttpStatus;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;
import java.util.function.BiConsumer;

/** Single-workspace modular monolith. State changes and resource leases share one transaction/lock. */
@Service
@Transactional
public class PlatformService {
    private final DocumentStore store;
    private final BCryptPasswordEncoder passwords=new BCryptPasswordEncoder(12);
    private final SecureRandom random=new SecureRandom();
    private final Map<String,String> connections=new HashMap<>();
    private final Map<String,LoginAttempts> loginAttempts=new HashMap<>();
    private BiConsumer<String,Map<String,Object>> sender=(id,msg)->{};
    private java.util.function.Consumer<String> closer=id->{};
    @Value("${platform.admin-password}") private String adminPassword;
    @Value("${platform.evidence-path}") private String evidencePath;
    @Value("${platform.session-hours:12}") private int sessionHours;
    @Value("${platform.lease-seconds:30}") private int leaseSeconds;
    @Value("${platform.scheduler-enabled:true}") private boolean schedulerEnabled;
    public PlatformService(DocumentStore store) { this.store=store; }
    @PostConstruct void initialize() {
        validatePassword(adminPassword);
        if(store.list("user").stream().noneMatch(u->"admin".equals(u.get("username")))) {
            var admin=base("user"); admin.putAll(map("username","admin","displayName","平台管理员","role","ADMIN","passwordHash",passwords.encode(adminPassword)));
            store.save("user",admin); audit("system","BOOTSTRAP_ADMIN",str(admin,"id"),"Created administrator from environment");
        }
        // A restarted platform cannot certify cleanup for a resource with a previous lease.
        for(var device:store.list("device")) {
            if(Set.of("BUSY","CLEANING").contains(str(device,"status"))) {
                device.put("status","MAINTENANCE"); device.put("quarantined",true);
            } else if(!"MAINTENANCE".equals(device.get("status"))) device.put("status","OFFLINE");
            store.save("device",device);
        }
        for(var run:store.list("run")) if(active(run)) finish(run,"FAILED","Platform restarted; cleanup confirmation required");
        for(var agent:store.list("agent")) { agent.put("status","OFFLINE"); store.save("agent",agent); }
        try { Files.createDirectories(Path.of(evidencePath).toAbsolutePath()); } catch(Exception e) { throw new IllegalStateException("Cannot create evidence directory",e); }
    }
    public synchronized void transport(BiConsumer<String,Map<String,Object>> send,java.util.function.Consumer<String> close) { sender=send; closer=close; }
    public synchronized Map<String,Object> login(String username,String password) {
        if(username==null||password==null) throw ApiException.bad("Username and password required");
        var attempts=loginAttempts.computeIfAbsent(username,k->new LoginAttempts());
        if(attempts.since.isBefore(Instant.now().minusSeconds(60))) { attempts.failures=0; attempts.since=Instant.now(); }
        if(attempts.failures>=5) throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,"Too many login attempts; wait one minute");
        var user=store.list("user").stream().filter(u->username.equals(u.get("username"))).findFirst().orElse(null);
        if(user==null||!passwords.matches(password,str(user,"passwordHash"))) {
            attempts.failures++; throw ApiException.unauthorized("Invalid username or password");
        }
        loginAttempts.remove(username);
        String token=secret(); var session=map("id","token-"+hash(token),"userId",user.get("id"),"expiresAt",Instant.now().plusSeconds(sessionHours*3600L).toString());
        store.save("session",session); audit(username,"LOGIN",str(user,"id"),"Password login");
        return map("token",token,"user",publicUser(user));
    }
    public synchronized Map<String,Object> authenticate(String token) {
        try {
            var session=store.get("session","token-"+hash(token));
            if(Instant.parse(str(session,"expiresAt")).isBefore(Instant.now())) throw ApiException.unauthorized("Session expired");
            return publicUser(store.get("user",str(session,"userId")));
        } catch(ApiException e) { throw ApiException.unauthorized("Invalid or expired token"); }
    }
    public synchronized void audit(String actor,String action,String target,String detail) {
        var record=base("audit"); record.putAll(map("actor",actor,"action",action,"target",target,"detail",detail)); store.save("audit",record);
    }
    public synchronized List<Map<String,Object>> list(String kind) {
        var values=store.list(kind); values.sort(Comparator.comparing((Map<String,Object> m)->str(m,"createdAt")).reversed());
        return values.stream().map(v->publicDocument(kind,v)).toList();
    }
    public synchronized Map<String,Object> get(String kind,String id) { return publicDocument(kind,store.get(kind,id)); }
    public synchronized Map<String,Object> createCase(Map<String,Object> input,String actor) {
        var value=base("case"); value.putAll(caseFields(input)); value.put("status","DRAFT"); value.put("revision",1);
        store.save("case",value); history(value,actor,"CREATE"); audit(actor,"CREATE_CASE",str(value,"id"),str(value,"name")); return value;
    }
    public synchronized Map<String,Object> updateCase(String id,Map<String,Object> input,String actor) {
        var value=store.get("case",id); value.putAll(caseFields(input)); value.put("status","DRAFT"); value.put("updatedAt",now()); value.put("revision",number(value,"revision",0)+1);
        store.save("case",value); history(value,actor,"UPDATE"); audit(actor,"UPDATE_CASE",id,"Revision requires approval"); return value;
    }
    public synchronized Map<String,Object> approveCase(String id,int expectedRevision,String actor) {
        if(expectedRevision<1)throw ApiException.bad("The reviewed case revision is required");
        var value=store.get("case",id);
        if(number(value,"revision",0)!=expectedRevision)throw new ApiException(HttpStatus.CONFLICT,"Case changed since review; reload the current revision and review again");
        if("APPROVED".equals(value.get("status")))return value;
        value.put("status","APPROVED"); value.put("updatedAt",now()); value.put("approvedBy",actor);
        store.save("case",value); history(value,actor,"APPROVE"); audit(actor,"APPROVE_CASE",id,str(value,"name")); return value;
    }
    public synchronized List<Map<String,Object>> caseHistory(String id) {
        store.get("case",id); return store.list("history").stream().filter(h->id.equals(h.get("caseId"))).sorted(Comparator.comparing(h->str(h,"createdAt"))).toList();
    }
    public synchronized void deleteCase(String id,String actor) {
        store.get("case",id);
        if(store.list("plan").stream().anyMatch(p->strings(p.get("caseIds")).contains(id))) throw ApiException.bad("Case belongs to a plan; remove it from that plan first");
        store.delete("case",id); audit(actor,"DELETE_CASE",id,"Deleted case; execution snapshots retained");
    }
    private Map<String,Object> caseFields(Map<String,Object> in) {
        String platform=choice(in,"platform","web",Set.of("web","android","ios"));
        String framework=choice(in,"framework",platform.equals("web")?"playwright":"appium",Set.of("playwright","appium","maestro"));
        if(platform.equals("web")&&!framework.equals("playwright") || !platform.equals("web")&&framework.equals("playwright")) throw ApiException.bad("Framework does not match platform");
        List<Map<String,Object>> steps=objects(in.get("steps"));
        if(steps.isEmpty()||steps.size()>200) throw ApiException.bad("Case requires 1..200 structured steps");
        List<Map<String,Object>> normalized=new ArrayList<>();
        for(var step:steps) {
            String action=choice(step,"action","",Set.of("goto","click","fill","expectText","expectVisible","screenshot"));
            String target=text(step,"target","",2000), value=text(step,"value","",10000);
            if(!action.equals("screenshot")&&target.isBlank()) throw ApiException.bad("Step target required");
            if(action.equals("goto")&&!target.matches("(?i)^https?://[^\\s]+$")) throw ApiException.bad("goto requires an HTTP(S) URL");
            normalized.add(map("action",action,"target",target,"value",value));
        }
        return map("name",required(in,"name",200),"description",text(in,"description","",10000),"platform",platform,"framework",framework,
                "suite",choice(in,"suite","smoke",Set.of("smoke","regression")),"priority",choice(in,"priority","P1",Set.of("P0","P1","P2")),
                "tags",tags(in.get("tags")),"sensitive",bool(in,"sensitive",false),"steps",normalized);
    }
    private void history(Map<String,Object> value,String actor,String action) {
        var h=base("history"); h.putAll(map("caseId",value.get("id"),"revision",value.get("revision"),"actor",actor,"action",action,"snapshot",new LinkedHashMap<>(value))); store.save("history",h);
    }
    public synchronized Map<String,Object> savePlan(String id,Map<String,Object> in,String actor) {
        var plan=id==null?base("plan"):store.get("plan",id); var ids=caseIds(in.get("caseIds"),false);
        plan.putAll(map("name",required(in,"name",200),"description",text(in,"description","",10000),"caseIds",ids,
                "capabilities",capabilities(in.get("capabilities")),"priority",bounded(in,"priority",0,0,100),
                "queueTimeoutSeconds",bounded(in,"queueTimeoutSeconds",600,1,86400),"executionTimeoutSeconds",bounded(in,"executionTimeoutSeconds",300,1,86400),"updatedAt",now()));
        store.save("plan",plan); audit(actor,id==null?"CREATE_PLAN":"UPDATE_PLAN",str(plan,"id"),str(plan,"name")); return plan;
    }
    public synchronized void deletePlan(String id,String actor) { store.get("plan",id); store.delete("plan",id); audit(actor,"DELETE_PLAN",id,""); }
    public synchronized Map<String,Object> createRun(Map<String,Object> in,String actor) {
        Map<String,Object> defaults=new LinkedHashMap<>();
        String planId=text(in,"planId","",128);
        if(!planId.isBlank()) defaults.putAll(store.get("plan",planId));
        defaults.putAll(in);
        var ids=caseIds(defaults.get("caseIds"),true);
        List<Map<String,Object>> snapshots=ids.stream().map(id->store.get("case",id)).toList();
        Map<String,Object> caps=capabilities(defaults.get("capabilities"));
        String platform=str(caps,"platform");
        if(snapshots.stream().anyMatch(c->!platform.equals(c.get("platform")))) throw ApiException.bad("All cases must match requested platform");
        var run=base("run"); run.putAll(map("name",text(defaults,"name","执行 "+LocalDate.now(),200),"planId",planId,"status","QUEUED","caseIds",ids,
                "capabilities",caps,"priority",bounded(defaults,"priority",0,0,100),"queueTimeoutSeconds",bounded(defaults,"queueTimeoutSeconds",600,1,86400),
                "executionTimeoutSeconds",bounded(defaults,"executionTimeoutSeconds",300,1,86400),"commitSha",text(in,"commitSha","",128),"createdBy",actor,
                "results",new ArrayList<>(),"logs",new ArrayList<>(),"summary",map("passed",0,"failed",0,"total",ids.size(),"durationMs",0),"message","Waiting for matching resource",
                "_cases",snapshots,"sensitive",snapshots.stream().anyMatch(c->bool(c,"sensitive",false))));
        store.save("run",run); audit(actor,"CREATE_RUN",str(run,"id"),str(run,"name")); tick(); return publicDocument("run",store.get("run",str(run,"id")));
    }
    public synchronized Map<String,Object> cancelRun(String id,String actor) {
        var run=store.get("run",id);
        if(terminal(run)) return publicDocument("run",run);
        finish(run,"CANCELLED","Cancelled by "+actor);
        if(run.containsKey("agentId")) {
            quarantine(run,"CLEANING"); send(str(run,"agentId"),map("type","cancel","taskId",id,"reason","cancelled"));
        }
        audit(actor,"CANCEL_RUN",id,""); return publicDocument("run",run);
    }
    private List<String> caseIds(Object source,boolean approved) {
        var ids=strings(source); if(ids.isEmpty()||ids.size()>200||new HashSet<>(ids).size()!=ids.size()) throw ApiException.bad("Choose 1..200 distinct cases");
        for(String id:ids) { var c=store.get("case",id); if(approved&&!"APPROVED".equals(c.get("status"))) throw ApiException.bad("Case "+str(c,"name")+" needs human approval"); }
        return ids;
    }
    private Map<String,Object> capabilities(Object source) {
        Map<String,Object> in=source instanceof Map<?,?>?cast(source):Map.of();
        Map<String,Object> caps=map("platform",choice(in,"platform","web",Set.of("web","android","ios")),"provider",choice(in,"provider","local",Set.of("local","cloud")),"tags",tags(in.get("tags")));
        if(caps.get("platform").equals("web")) caps.put("browser",text(in,"browser","chromium",100));
        for(String field:List.of("version","brand","model")) if(in.containsKey(field)) caps.put(field,text(in,field,"",100));
        return caps;
    }
    public synchronized Map<String,Object> createUser(Map<String,Object> in,String actor) {
        String username=required(in,"username",64); if(!username.matches("[a-zA-Z0-9_.-]{3,64}")) throw ApiException.bad("Username must contain 3..64 letters, numbers, _, . or -");
        if(store.list("user").stream().anyMatch(u->username.equals(u.get("username")))) throw ApiException.bad("Username already exists");
        String password=required(in,"password",72);
        if(password.length()<12||password.getBytes(StandardCharsets.UTF_8).length>72) throw ApiException.bad("Password must be 12..72 UTF-8 bytes");
        var user=base("user"); user.putAll(map("username",username,"displayName",text(in,"displayName",username,100),"role",choice(in,"role","VIEWER",Set.of("ADMIN","TESTER","DEVELOPER","VIEWER")),"passwordHash",passwords.encode(password)));
        store.save("user",user); audit(actor,"CREATE_USER",str(user,"id"),username); return publicUser(user);
    }
    public synchronized Map<String,Object> createKey(Map<String,Object> in,String actor) {
        String key=secret(); var record=base("key"); record.putAll(map("name",required(in,"name",100),"keyHash",hash(key),"revoked",false));
        store.save("key",record); audit(actor,"CREATE_AGENT_KEY",str(record,"id"),str(record,"name")); var result=publicDocument("key",record); result.put("key",key); return result;
    }
    public synchronized void revokeKey(String id,String actor) {
        var key=store.get("key",id); key.put("revoked",true); store.save("key",key); audit(actor,"REVOKE_AGENT_KEY",id,"");
        String agent=str(key,"agentId"); if(!agent.isBlank()) { String session=connections.get(agent); if(session!=null) { disconnect(session); closer.accept(session); } }
    }
    private Map<String,Object> key(String plaintext) {
        if(plaintext==null||plaintext.isBlank()) throw ApiException.unauthorized("Agent key required");
        byte[] sought=hash(plaintext).getBytes(StandardCharsets.US_ASCII);
        return store.list("key").stream().filter(k->!bool(k,"revoked",false)&&MessageDigest.isEqual(sought,str(k,"keyHash").getBytes(StandardCharsets.US_ASCII))).findFirst().orElseThrow(()->ApiException.unauthorized("Invalid or revoked agent key"));
    }
    public synchronized Map<String,Object> updateDevice(String id,Map<String,Object> in,String actor) {
        var d=store.get("device",id);
        if(in.containsKey("status")) {
            if(Set.of("BUSY","CLEANING").contains(str(d,"status"))) throw ApiException.bad("Occupied device cannot be changed");
            String status=choice(in,"status","MAINTENANCE",Set.of("MAINTENANCE","IDLE","OFFLINE"));
            if(status.equals("IDLE")&&(bool(d,"quarantined",false)||!connections.containsKey(str(d,"agentId")))) throw ApiException.bad("Device requires an online agent clean confirmation");
            d.put("status",status); d.put("adminMaintenance",status.equals("MAINTENANCE"));
        }
        if(in.containsKey("tags")) d.put("tags",tags(in.get("tags")));
        store.save("device",d); audit(actor,"UPDATE_DEVICE",id,"Resource administration"); return publicDocument("device",d);
    }
    public synchronized Map<String,Object> dashboard() {
        var runs=list("run"); long passed=runs.stream().filter(r->"PASSED".equals(r.get("status"))).count();
        long completed=runs.stream().filter(r->Set.of("PASSED","FAILED","TIMED_OUT").contains(str(r,"status"))).count();
        List<Map<String,Object>> trend=new ArrayList<>();
        for(int i=6;i>=0;i--) { String date=LocalDate.now(ZoneOffset.UTC).minusDays(i).toString(); trend.add(map("date",date,"passed",runs.stream().filter(r->str(r,"createdAt").startsWith(date)&&"PASSED".equals(r.get("status"))).count(),"failed",runs.stream().filter(r->str(r,"createdAt").startsWith(date)&&Set.of("FAILED","TIMED_OUT").contains(str(r,"status"))).count())); }
        return map("totalCases",store.list("case").size(),"totalPlans",store.list("plan").size(),"totalRuns",runs.size(),"passRate",completed==0?0:Math.round(passed*10000.0/completed)/100.0,
                "onlineAgents",connections.size(),"availableDevices",store.list("device").stream().filter(d->"IDLE".equals(d.get("status"))).count(),"runningRuns",runs.stream().filter(PlatformService::active).count(),
                "queuedRuns",runs.stream().filter(r->"QUEUED".equals(r.get("status"))).count(),"recentRuns",runs.stream().limit(8).toList(),"trend",trend,"platformStatus",connections.isEmpty()?"WAITING_FOR_AGENT":"READY");
    }
    public synchronized Map<String,Object> settings() {
        return map("workspace","default","singleWorkspace",true,"integrations",map("agent",connections.isEmpty()?"unconnected":"connected","ai","unconnected","mobile","unconnected","cloud","unconnected"),
                "capabilities",map("web",true,"mobile",false,"remoteStreaming",false,"aiDrafts",false),"leaseSeconds",leaseSeconds,"sessionHours",sessionHours,"evidenceStorage","local","transport","TLS required externally");
    }

    public synchronized String register(String session,Map<String,Object> message) {
        var key=key(required(message,"agentKey",256));
        String id=required(message,"agentId",128), fingerprint=required(message,"hostFingerprint",256);
        if(!id.matches("[A-Za-z0-9_.:-]{1,128}")) throw ApiException.bad("Invalid agentId");
        if(key.containsKey("agentId")&&(!id.equals(key.get("agentId"))||!fingerprint.equals(key.get("hostFingerprint")))) throw ApiException.forbidden("Agent key is bound to another agent or host");
        var existing=store.list("agent").stream().filter(a->id.equals(a.get("id"))).findFirst().orElse(null);
        if(existing!=null&&!key.get("id").equals(existing.get("keyId"))) throw ApiException.forbidden("Agent identity belongs to another key");
        List<Map<String,Object>> targets=validateTargets(id,message.get("targets"));
        String previous=connections.get(id);
        if(previous!=null&&!previous.equals(session)) { disconnect(previous); closer.accept(previous); }
        key.put("agentId",id); key.put("hostFingerprint",fingerprint); store.save("key",key);
        Map<String,Object> agent=existing==null?map("id",id,"createdAt",now(),"workspaceId","default"):existing;
        agent.putAll(map("name",text(message,"name",id,200),"hostFingerprint",fingerprint,"keyId",key.get("id"),"lastSeen",now(),"status","ONLINE","targetIds",targets.stream().map(t->str(t,"id")).toList()));
        store.save("agent",agent); reconcileTargets(id,targets);
        // Registration acknowledgement precedes making this connection eligible for scheduling.
        sender.accept(session,map("type","registered","agentId",id,"heartbeatIntervalMs",10000)); connections.put(id,session);
        audit(id,"REGISTER_AGENT",id,"Authenticated outbound connection"); return id;
    }
    public synchronized void agentMessage(String session,Map<String,Object> message) {
        String agent=connections.entrySet().stream().filter(e->session.equals(e.getValue())).map(Map.Entry::getKey).findFirst().orElseThrow(()->ApiException.unauthorized("Register first"));
        var a=store.get("agent",agent); var k=store.get("key",str(a,"keyId")); if(bool(k,"revoked",false)) throw ApiException.unauthorized("Agent key revoked");
        String type=required(message,"type",32);
        if(type.equals("heartbeat")) {
            var targets=validateTargets(agent,message.get("targets")); reconcileTargets(agent,targets); a.put("lastSeen",now()); a.put("targetIds",targets.stream().map(t->str(t,"id")).toList()); store.save("agent",a);
            return;
        }
        String task=required(message,"taskId",128); var run=store.get("run",task);
        if(!agent.equals(run.get("agentId"))) throw ApiException.forbidden("Task belongs to another agent");
        if(bool(run,"completionReceived",false)) return; // Retransmitted completion/acks are harmless.
        var device=store.get("device",str(run,"deviceId"));
        if(!task.equals(device.get("taskId"))) throw ApiException.forbidden("Task no longer owns its resource lease");
        switch(type) {
            case "ack" -> { if("ASSIGNED".equals(run.get("status"))) { run.put("status","RUNNING"); run.put("startedAt",now()); run.put("message","Agent executing approved cases"); store.save("run",run); } }
            case "progress" -> { if(!terminal(run)) { var logs=new ArrayList<>(strings(run.get("logs"))); if(logs.size()<2000) logs.add(text(message,"message","",4000)); run.put("logs",logs); store.save("run",run); } }
            case "done" -> complete(run,device,message,agent);
            default -> throw ApiException.bad("Unknown agent message type");
        }
    }
    private List<Map<String,Object>> validateTargets(String agent,Object source) {
        var targets=objects(source); if(targets.size()>50) throw ApiException.bad("Agent target limit is 50");
        Set<String> ids=new HashSet<>(); List<Map<String,Object>> normalized=new ArrayList<>();
        for(var in:targets) {
            String id=required(in,"id",128); if(!id.matches("[A-Za-z0-9_.:-]{1,128}")||!ids.add(id)) throw ApiException.bad("Invalid or duplicate target id");
            var existing=store.list("device").stream().filter(d->id.equals(d.get("id"))).findFirst().orElse(null);
            if(existing!=null&&!agent.equals(existing.get("agentId"))) throw ApiException.forbidden("Target belongs to another agent");
            var target=map("id",id,"name",text(in,"name",id,200),"platform",choice(in,"platform","web",Set.of("web","android","ios")),"version",text(in,"version","",100),
                    "browser",text(in,"browser","",100),"brand",text(in,"brand","",100),"model",text(in,"model","",100),"provider",choice(in,"provider","local",Set.of("local","cloud")),"tags",tags(in.get("tags")),
                    "cleanupOk",bool(in,"cleanupOk",false),"reportedStatus",text(in,"status","IDLE",32));
            normalized.add(target);
        }
        return normalized;
    }
    private void reconcileTargets(String agent,List<Map<String,Object>> targets) {
        Set<String> reported=new HashSet<>();
        for(var target:targets) {
            String id=str(target,"id"); reported.add(id);
            var old=store.list("device").stream().filter(d->id.equals(d.get("id"))).findFirst().orElse(null);
            boolean initialClean=bool(target,"cleanupOk",false)&&"IDLE".equals(target.get("reportedStatus"));
            var d=old==null?map("id",id,"createdAt",now(),"workspaceId","default","status",initialClean?"IDLE":"MAINTENANCE","quarantined",!initialClean):old;
            // Agent discovery may never replace administrator-owned trust tags after enrollment.
            var retainedTags=old==null?strings(target.get("tags")).stream().filter(t->!t.equals("trusted")).toList():old.get("tags");
            for(String field:List.of("name","platform","version","browser","brand","model","provider")) d.put(field,target.get(field));
            d.put("tags",retainedTags); d.put("agentId",agent); d.put("lastSeen",now());
            String reportedStatus=str(target,"reportedStatus");
            if(reportedStatus.equals("MAINTENANCE")) {
                failDeviceRun(d,"Agent reported an unavailable target"); d.put("status","MAINTENANCE"); d.put("quarantined",true);
            } else if(reportedStatus.equals("OFFLINE")) {
                failDeviceRun(d,"Target disappeared"); d.put("status","OFFLINE");
            } else if(bool(d,"quarantined",false)&&!d.containsKey("taskId")&&bool(target,"cleanupOk",false)&&reportedStatus.equals("IDLE")&&!bool(d,"adminMaintenance",false)) {
                d.put("status","IDLE"); d.put("quarantined",false); d.remove("taskId");
            } else if("OFFLINE".equals(d.get("status"))&&!bool(d,"adminMaintenance",false)&&!bool(d,"quarantined",false)) { d.put("status",initialClean?"IDLE":"MAINTENANCE"); d.put("quarantined",!initialClean); }
            store.save("device",d);
        }
        for(var d:store.list("device")) if(agent.equals(d.get("agentId"))&&!reported.contains(str(d,"id"))) {
            failDeviceRun(d,"Target no longer reported"); d.put("status","OFFLINE"); store.save("device",d);
        }
    }
    private void complete(Map<String,Object> run,Map<String,Object> device,Map<String,Object> message,String agent) {
        boolean eligibleQuality=!terminal(run);
        var results=objects(message.get("results")); if(results.size()>200) throw ApiException.bad("Too many results");
        var expected=strings(run.get("caseIds")); Set<String> seen=new HashSet<>(); List<Map<String,Object>> verified=new ArrayList<>(); int passed=0,failed=0; long duration=0;
        var cases=objects(run.get("_cases"));
        for(var result:results) {
            String caseId=required(result,"caseId",128); if(!expected.contains(caseId)||!seen.add(caseId)) throw ApiException.bad("Unexpected or duplicate case result");
            String status=choice(result,"status","FAILED",Set.of("PASSED","FAILED","SKIPPED","TIMED_OUT"));
            long ms=bounded(result,"durationMs",0,0,Integer.MAX_VALUE); duration+=ms;
            List<Map<String,Object>> evidence=new ArrayList<>();
            for(var reference:objects(result.get("evidence"))) {
                var stored=store.get("evidence",required(reference,"id",128));
                if(!run.get("id").equals(stored.get("taskId"))) throw ApiException.forbidden("Evidence belongs to another task");
                evidence.add(publicDocument("evidence",stored));
            }
            var test=cases.stream().filter(c->caseId.equals(c.get("id"))).findFirst().orElseThrow();
            verified.add(map("caseId",caseId,"name",test.get("name"),"status",status,"durationMs",ms,"error",text(result,"error","",10000),"steps",objects(result.get("steps")),"evidence",evidence));
            if(status.equals("PASSED")) passed++; else failed++;
        }
        for(String id:expected) if(!seen.contains(id)) { var c=cases.stream().filter(x->id.equals(x.get("id"))).findFirst().orElseThrow(); verified.add(map("caseId",id,"name",c.get("name"),"status","FAILED","durationMs",0,"error","Agent returned no result","steps",List.of(),"evidence",List.of())); failed++; }
        boolean cleaned=bool(message,"cleanupOk",false);
        run.put("completionReceived",true); run.put("results",verified); run.put("summary",map("passed",passed,"failed",failed,"total",expected.size(),"durationMs",duration));
        var logs=strings(message.get("logs")); if(logs.size()>2000||logs.stream().anyMatch(s->s.length()>4000)) throw ApiException.bad("Logs exceed permitted size");
        var existingLogs=new ArrayList<>(strings(run.get("logs"))); existingLogs.addAll(logs); run.put("logs",existingLogs.stream().limit(2000).toList());
        if(!terminal(run)) {
            run.put("status","CLEANING"); store.save("run",run); device.put("status","CLEANING"); store.save("device",device);
            finish(run,failed==0&&passed==expected.size()&&cleaned?"PASSED":"FAILED",cleaned?(failed==0?"All approved cases passed":"One or more cases failed"):"Resource cleanup failed; device quarantined");
        } else store.save("run",run);
        device.put("status",cleaned&&!bool(device,"adminMaintenance",false)?"IDLE":"MAINTENANCE"); device.put("quarantined",!cleaned); device.remove("taskId"); store.save("device",device);
        if(eligibleQuality) recordQuality(run,verified,seen);
        audit(agent,"COMPLETE_RUN",str(run,"id"),"Validated results; cleanupOk="+cleaned);
    }
    public synchronized void disconnect(String session) {
        var ids=connections.entrySet().stream().filter(e->session.equals(e.getValue())).map(Map.Entry::getKey).toList();
        for(String agent:ids) {
            connections.remove(agent); var a=store.get("agent",agent); a.put("status","OFFLINE"); store.save("agent",a);
            for(var device:store.list("device")) if(agent.equals(device.get("agentId"))) {
                failDeviceRun(device,"Agent disconnected; resource requires clean confirmation");
                device.put("status","MAINTENANCE"); device.put("quarantined",true); store.save("device",device);
            }
            audit(agent,"DISCONNECT_AGENT",agent,"Resources quarantined");
        }
    }
    private void failDeviceRun(Map<String,Object> device,String reason) {
        String task=str(device,"taskId");
        if(!task.isBlank()) { var run=store.get("run",task); if(!terminal(run)) finish(run,"FAILED",reason); device.put("quarantined",true); device.remove("taskId"); }
    }
    @Scheduled(fixedDelayString="${platform.scheduler-delay-ms:1000}",initialDelayString="${platform.scheduler-delay-ms:1000}")
    public synchronized void tick() {
        if(!schedulerEnabled) return;
        Instant current=Instant.now();
        for(var a:store.list("agent")) if(connections.containsKey(str(a,"id"))&&Instant.parse(str(a,"lastSeen")).plusSeconds(leaseSeconds).isBefore(current)) {
            String session=connections.get(str(a,"id")); disconnect(session); closer.accept(session);
        }
        for(var run:store.list("run")) {
            if("QUEUED".equals(run.get("status"))&&Instant.parse(str(run,"createdAt")).plusSeconds(number(run,"queueTimeoutSeconds",600)).isBefore(current)) finish(run,"TIMED_OUT","Queue timeout: no matching clean resource");
            if(active(run)&&Instant.parse(str(run,"assignedAt")).plusSeconds(number(run,"executionTimeoutSeconds",300)).isBefore(current)) {
                finish(run,"TIMED_OUT","Execution timeout"); quarantine(run,"CLEANING"); send(str(run,"agentId"),map("type","cancel","taskId",run.get("id"),"reason","execution timeout"));
            }
        }
        // A cancellation with no cleanup response is never returned to IDLE by elapsed time.
        for(var d:store.list("device")) if("CLEANING".equals(d.get("status"))&&Instant.parse(str(d,"cleaningAt")).plusSeconds(leaseSeconds).isBefore(current)) { d.put("status","MAINTENANCE"); d.put("quarantined",true); store.save("device",d); }
        var queue=store.list("run").stream().filter(r->"QUEUED".equals(r.get("status"))).sorted(Comparator.<Map<String,Object>>comparingInt(r->number(r,"priority",0)).reversed().thenComparing(r->str(r,"createdAt"))).toList();
        for(var run:queue) {
            var matching=store.list("device").stream().filter(d->"IDLE".equals(d.get("status"))&&connections.containsKey(str(d,"agentId"))&&matches(run,d)).sorted(Comparator.comparing(d->str(d,"id"))).findFirst();
            if(matching.isEmpty()) continue;
            var d=matching.get(); d.put("status","BUSY"); d.put("taskId",run.get("id")); store.save("device",d);
            run.putAll(map("status","ASSIGNED","assignedAt",now(),"deviceId",d.get("id"),"agentId",d.get("agentId"),"deviceFingerprint",publicDocument("device",d),"message","Waiting for agent acknowledgement")); store.save("run",run);
            audit("scheduler","ASSIGN_RUN",str(run,"id"),"Resource "+d.get("id"));
            send(str(d,"agentId"),map("type","assign","taskId",run.get("id"),"run",publicDocument("run",run),"cases",run.get("_cases")));
        }
        for(var session:store.list("session")) if(Instant.parse(str(session,"expiresAt")).isBefore(current)) store.delete("session",str(session,"id"));
    }
    static boolean matches(Map<String,Object> run,Map<String,Object> device) {
        var caps=cast(run.get("capabilities"));
        for(String key:List.of("platform","provider","browser","brand","model")) if(caps.containsKey(key)&&!str(caps,key).isBlank()&&!str(caps,key).equalsIgnoreCase(str(device,key))) return false;
        if(!strings(device.get("tags")).containsAll(strings(caps.get("tags")))) return false;
        if(bool(run,"sensitive",false)&&(!"local".equals(device.get("provider"))||!strings(device.get("tags")).contains("trusted"))) return false;
        String version=str(caps,"version");
        if(version.startsWith(">=")) { try { return Double.parseDouble(str(device,"version").replaceAll("[^0-9.].*",""))>=Double.parseDouble(version.substring(2)); } catch(Exception e) { return false; } }
        return version.isBlank()||version.equals(str(device,"version"));
    }
    private void quarantine(Map<String,Object> run,String status) { var d=store.get("device",str(run,"deviceId")); d.put("status",status); d.put("quarantined",true); d.put("cleaningAt",now()); store.save("device",d); }
    private void finish(Map<String,Object> run,String status,String message) { run.put("status",status); run.put("finishedAt",now()); run.put("message",message); store.save("run",run); }
    private void send(String agent,Map<String,Object> message) {
        String session=connections.get(agent); if(session==null) return;
        try { sender.accept(session,message); } catch(Exception e) { disconnect(session); closer.accept(session); }
    }
    public synchronized Map<String,Object> uploadEvidence(String agentKey,String taskId,MultipartFile file) {
        var k=key(agentKey); String agent=str(k,"agentId"); var run=store.get("run",taskId);
        if(!agent.equals(run.get("agentId"))||terminal(run)||!connections.containsKey(agent)) throw ApiException.forbidden("Evidence requires a current owned assignment");
        var device=store.get("device",str(run,"deviceId")); if(!taskId.equals(device.get("taskId"))) throw ApiException.forbidden("Resource lease is no longer owned");
        if(file.isEmpty()||file.getSize()>100L*1024*1024) throw ApiException.bad("Evidence size must be 1 byte..100 MiB");
        var record=base("evidence"); String id=str(record,"id");
        String supplied=file.getOriginalFilename(); String name=(supplied==null?"evidence":supplied).replace('\\','/'); name=name.substring(name.lastIndexOf('/')+1).replaceAll("[\\p{Cntrl}]",""); if(name.length()>200)name=name.substring(0,200);
        String contentType=Objects.toString(file.getContentType(),"application/octet-stream");
        Path root=Path.of(evidencePath).toAbsolutePath().normalize(), path=root.resolve(id).normalize(); if(!path.startsWith(root)) throw ApiException.bad("Invalid evidence path");
        try { Files.copy(file.getInputStream(),path,StandardCopyOption.REPLACE_EXISTING); } catch(Exception e) { throw new IllegalStateException("Cannot persist evidence",e); }
        record.putAll(map("taskId",taskId,"agentId",agent,"name",name,"contentType",contentType,"size",file.getSize(),"url","/api/evidence/"+id,"path",path.toString())); store.save("evidence",record);
        audit(agent,"UPLOAD_EVIDENCE",taskId,id); return publicDocument("evidence",record);
    }
    public synchronized Map<String,Object> evidence(String id,String actor) { var record=store.get("evidence",id); audit(actor,"DOWNLOAD_EVIDENCE",str(record,"taskId"),id); return record; }
    public synchronized String junit(String id) {
        var run=store.get("run",id); var results=objects(run.get("results")); int failed=(int)results.stream().filter(r->!"PASSED".equals(r.get("status"))).count();
        boolean infrastructure=results.isEmpty()&&terminal(run)&&!"PASSED".equals(run.get("status"));
        StringBuilder xml=new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<testsuite name=\"").append(escape(str(run,"name"))).append("\" tests=\"").append(infrastructure?1:results.size()).append("\" failures=\"").append(failed).append("\" errors=\"").append(infrastructure?1:0).append("\" time=\"").append(number(cast(run.get("summary")),"durationMs",0)/1000.0).append("\">");
        for(var r:results) { xml.append("<testcase classname=\"smarttest\" name=\"").append(escape(str(r,"name"))).append("\" time=\"").append(number(r,"durationMs",0)/1000.0).append("\">"); if(!"PASSED".equals(r.get("status"))) xml.append("<failure message=\"").append(escape(str(r,"error"))).append("\"/>"); xml.append("</testcase>"); }
        if(infrastructure) xml.append("<testcase classname=\"smarttest.infrastructure\" name=\"execution\"><error message=\"").append(escape(str(run,"message"))).append("\"/></testcase>");
        return xml.append("<system-out>").append(escape(String.join("\n",strings(run.get("logs"))))).append("</system-out></testsuite>").toString();
    }
    public synchronized Map<String,Object> allure(String id) {
        var run=store.get("run",id);
        var result=objects(run.get("results")).stream().map(r->map("uuid",id+"-"+r.get("caseId"),"name",r.get("name"),"status","PASSED".equals(r.get("status"))?"passed":"failed","statusDetails",map("message",r.get("error")),
            "steps",objects(r.get("steps")).stream().map(s->map("name",str(s,"action")+" "+str(s,"target"),"status","PASSED".equals(s.get("status"))?"passed":"failed","statusDetails",map("message",str(s,"error")))).toList(),
            "attachments",objects(r.get("evidence")).stream().map(e->map("name",e.get("name"),"type",e.get("contentType"),"source",e.get("url"))).toList(),
            "labels",List.of(map("name","device","value",run.get("deviceId")),map("name","commit","value",run.get("commitSha"))))).toList();
        return map("runId",id,"status",run.get("status"),"results",result);
    }
    private void recordQuality(Map<String,Object> run,List<Map<String,Object>> results,Set<String> supplied) {
        for(var result:results) {
            String id=str(result,"caseId"), verdict=str(result,"status");
            if(!supplied.contains(id)||!Set.of("PASSED","FAILED").contains(verdict))continue;
            var metric=store.list("quality").stream().filter(q->id.equals(q.get("id"))).findFirst().orElse(map("id",id,"caseId",id,"workspaceId","default","createdAt",now(),"executions",0,"passed",0,"failed",0,"ewmaScore",0.0,"quarantined",false));
            double score=((Number)metric.get("ewmaScore")).doubleValue(); String commit=str(run,"commitSha");
            boolean comparable=!commit.isBlank()&&commit.equals(metric.get("lastCommitSha"))&&!str(metric,"lastVerdict").isBlank();
            boolean flip=comparable&&!verdict.equals(metric.get("lastVerdict"));
            if(comparable) score=Math.round((0.2*(flip?1:0)+0.8*score)*1_000_000.0)/1_000_000.0;
            if(flip&&score>=0.15&&!bool(metric,"quarantined",false)) {
                metric.put("quarantined",true); metric.put("quarantinedAt",now()); metric.put("quarantineReason","Verdict changed for identical commit SHA; EWMA >= 0.15"); audit("quality","QUARANTINE_CASE",id,"EWMA="+score);
            }
            metric.putAll(map("name",result.get("name"),"executions",number(metric,"executions",0)+1,"passed",number(metric,"passed",0)+(verdict.equals("PASSED")?1:0),"failed",number(metric,"failed",0)+(verdict.equals("FAILED")?1:0),"ewmaScore",score,"lastCommitSha",commit,"lastVerdict",verdict,"lastRunId",run.get("id"),"updatedAt",now()));
            store.save("quality",metric);
        }
    }
    public synchronized Map<String,Object> releaseQuality(String caseId,Map<String,Object> in,String actor) {
        var metric=store.get("quality",caseId); String reason=required(in,"reason",1000); if(reason.strip().length()<5)throw ApiException.bad("Provide a meaningful review reason");
        metric.putAll(map("quarantined",false,"releasedBy",actor,"releasedAt",now(),"releaseReason",reason,"updatedAt",now())); store.save("quality",metric); audit(actor,"RELEASE_QUALITY_QUARANTINE",caseId,reason); return metric;
    }
    private static String escape(String value) { return value.replaceAll("[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]","").replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;").replace("'","&apos;"); }

    private static class LoginAttempts { int failures; Instant since=Instant.now(); }
    private static void validatePassword(String value) {
        if(value==null||value.length()<12||value.getBytes(StandardCharsets.UTF_8).length>72) throw new IllegalStateException("PLATFORM_ADMIN_PASSWORD/user password must be 12..72 UTF-8 bytes; no default password is provided");
    }
    private String secret() { byte[] bytes=new byte[32]; random.nextBytes(bytes); return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
    static String hash(String value) { try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); } catch(Exception e) { throw new IllegalStateException(e); } }
    static String now() { return Instant.now().toString(); }
    static Map<String,Object> base(String kind) { return map("id",kind+"-"+UUID.randomUUID(),"workspaceId","default","createdAt",now(),"updatedAt",now()); }
    static Map<String,Object> map(Object... entries) { var result=new LinkedHashMap<String,Object>(); for(int i=0;i<entries.length;i+=2) result.put((String)entries[i],entries[i+1]); return result; }
    static String str(Map<String,Object> m,String key) { Object value=m.get(key); return value==null?"":String.valueOf(value); }
    static String required(Map<String,Object> in,String key,int max) { String result=text(in,key,"",max); if(result.isBlank()) throw ApiException.bad(key+" required"); return result; }
    static String text(Map<String,Object> in,String key,String fallback,int max) { Object v=in.get(key); if(v==null) return fallback; if(!(v instanceof String)||((String)v).length()>max) throw ApiException.bad("Invalid "+key); return (String)v; }
    static String choice(Map<String,Object> in,String key,String fallback,Set<String> values) { String value=text(in,key,fallback,100); if(!values.contains(value)) throw ApiException.bad("Invalid "+key); return value; }
    static boolean bool(Map<String,Object> in,String key,boolean fallback) { Object value=in.get(key); if(value==null) return fallback; if(!(value instanceof Boolean)) throw ApiException.bad("Invalid "+key); return (boolean)value; }
    static int number(Map<String,Object> in,String key,int fallback) { Object v=in.get(key); return v instanceof Number?((Number)v).intValue():fallback; }
    static int bounded(Map<String,Object> in,String key,int fallback,int min,int max) { Object v=in.get(key); if(v==null)return fallback; if(!(v instanceof Number)||((Number)v).doubleValue()!=((Number)v).intValue())throw ApiException.bad("Invalid "+key); int n=((Number)v).intValue(); if(n<min||n>max)throw ApiException.bad(key+" outside permitted range"); return n; }
    @SuppressWarnings("unchecked") static Map<String,Object> cast(Object value) { return (Map<String,Object>)value; }
    static List<String> strings(Object source) { if(source==null) return new ArrayList<>(); if(!(source instanceof List<?> list)||list.stream().anyMatch(v->!(v instanceof String))) throw ApiException.bad("Expected string array"); return list.stream().map(String.class::cast).toList(); }
    static List<String> tags(Object source) { var tags=strings(source); if(tags.size()>30||tags.stream().anyMatch(t->t.isBlank()||t.length()>64)) throw ApiException.bad("Invalid tags"); return tags.stream().distinct().toList(); }
    static List<Map<String,Object>> objects(Object source) { if(source==null)return new ArrayList<>(); if(!(source instanceof List<?> list)||list.stream().anyMatch(v->!(v instanceof Map<?,?>)))throw ApiException.bad("Expected object array"); return list.stream().map(PlatformService::cast).toList(); }
    static boolean terminal(Map<String,Object> run) { return Set.of("PASSED","FAILED","TIMED_OUT","CANCELLED").contains(str(run,"status")); }
    static boolean active(Map<String,Object> run) { return Set.of("ASSIGNED","RUNNING","CLEANING").contains(str(run,"status")); }
    private Map<String,Object> publicUser(Map<String,Object> u) { return map("id",u.get("id"),"username",u.get("username"),"displayName",u.get("displayName"),"role",u.get("role")); }
    private Map<String,Object> publicDocument(String kind,Map<String,Object> value) {
        if(kind.equals("user")) return publicUser(value);
        var out=new LinkedHashMap<>(value); out.keySet().removeIf(k->k.startsWith("_")||Set.of("passwordHash","keyHash","taskId","adminMaintenance","path","completionReceived").contains(k)||kind.equals("device")&&k.equals("quarantined")); return out;
    }
}
