package com.smarttest.platform;

import java.util.*;
import static com.smarttest.platform.PlatformService.*;

/** Computes a gate only from persisted submission and completion facts, never user-facing text. */
final class RunGate {
    private RunGate() {}

    static Map<String,Object> submission(List<String> ids,List<Map<String,Object>> quality) {
        Set<String> quarantined=new HashSet<>();
        for(var metric:quality) if(Boolean.TRUE.equals(metric.get("quarantined"))) quarantined.add(str(metric,"id"));
        return map("policy","quarantine-at-submission-v1","quarantinedCaseIds",ids.stream().filter(quarantined::contains).toList());
    }

    static Map<String,Object> snapshot(Map<String,Object> run) {
        boolean terminal=terminal(run),legacy=!(run.get("_gateSubmission") instanceof Map<?,?>);
        var submission=legacy?map("policy","strict-legacy-v1","quarantinedCaseIds",List.of()):cast(run.get("_gateSubmission"));
        var expected=strings(run.get("caseIds")); var quarantined=strings(submission.get("quarantinedCaseIds"));
        var completion=run.get("_completion") instanceof Map<?,?>?cast(run.get("_completion")):Map.<String,Object>of();
        boolean hasCompletion=!completion.isEmpty();
        var supplied=hasCompletion?strings(completion.get("suppliedCaseIds")):List.<String>of();
        var explicit=hasCompletion?strings(completion.get("explicitStatusCaseIds")):List.<String>of();
        var raw=objects(run.get("results")); var snapshots=objects(run.get("_cases"));
        var errors=new ArrayList<String>();
        if(terminal) {
            if(hasCompletion) {
                errors.addAll(strings(completion.get("infrastructureErrors")));
                if(!Boolean.TRUE.equals(completion.get("cleanupProvided"))) errors.add("CLEANUP_NOT_CONFIRMED");
                else if(!Boolean.TRUE.equals(completion.get("cleanupOk"))) errors.add("CLEANUP_FAILED");
                if(!supplied.containsAll(expected)||supplied.size()!=expected.size()) errors.add("INCOMPLETE_RESULTS");
                if(!explicit.containsAll(expected)) errors.add("INCOMPLETE_RESULT_STATUS");
                if("FAILED".equals(completion.get("reportedStatus"))&&raw.stream().allMatch(r->"PASSED".equals(r.get("status")))) errors.add("CONTRADICTORY_COMPLETION_STATUS");
                if(Set.of("CANCELLED","TIMED_OUT").contains(str(completion,"reportedStatus"))) errors.add("EXECUTION_"+str(completion,"reportedStatus"));
            } else {
                // Old PASSED runs recorded completionReceived only after validating owned results and cleanup.
                boolean provenLegacyPass=legacy&&"PASSED".equals(run.get("status"))&&Boolean.TRUE.equals(run.get("completionReceived"))
                        &&raw.size()==expected.size()&&raw.stream().allMatch(r->"PASSED".equals(r.get("status")))
                        &&new HashSet<>(raw.stream().map(r->str(r,"caseId")).toList()).equals(new HashSet<>(expected));
                if(!provenLegacyPass) errors.add("COMPLETION_NOT_CONFIRMED");
            }
            if(Set.of("CANCELLED","TIMED_OUT").contains(str(run,"status"))) errors.add("RUN_"+str(run,"status"));
        }
        var cases=new ArrayList<Map<String,Object>>(); int passed=0,blocking=0,isolated=0;
        for(String id:expected) {
            var result=raw.stream().filter(r->id.equals(r.get("caseId"))).findFirst().orElse(null);
            boolean provided=result!=null&&(hasCompletion?supplied.contains(id):legacy);
            boolean validStatus=provided&&(!hasCompletion||explicit.contains(id));
            String status=!provided?"MISSING":!validStatus?"UNREPORTED":str(result,"status");
            String outcome;
            if(validStatus&&"PASSED".equals(status)) { outcome="PASSED"; passed++; }
            else if(validStatus&&"FAILED".equals(status)&&quarantined.contains(id)) { outcome="QUARANTINED"; isolated++; }
            else { outcome="BLOCKED"; if(terminal||provided) blocking++; }
            if(!terminal&&!provided) continue;
            var test=snapshots.stream().filter(c->id.equals(c.get("id"))).findFirst().orElse(Map.of());
            cases.add(map("caseId",id,"name",result==null?str(test,"name"):str(result,"name"),"status",status,"outcome",outcome,
                    "error",result==null?"Agent returned no result":str(result,"error"),"durationMs",result==null?0:number(result,"durationMs",0)));
        }
        String status=!terminal?"PENDING":!errors.isEmpty()||blocking>0||expected.isEmpty()?"BLOCKED":isolated>0?"WARN":"PASSED";
        var gate=map("policy",submission.get("policy"),"status",status,"total",expected.size(),"passed",passed,"blockingFailures",blocking,
                "quarantinedFailures",isolated,"infrastructureFailures",errors.size(),"quarantinedCaseIds",new ArrayList<>(quarantined));
        return map("gate",gate,"cases",cases,"errors",errors,"name",str(run,"name"),"durationMs",cast(run.get("summary")).getOrDefault("durationMs",0),"logs",new ArrayList<>(strings(run.get("logs"))));
    }

    static Map<String,Object> aggregate(List<Map<String,Object>> gates,boolean terminal) {
        int total=0,passed=0,blocking=0,isolated=0,infra=0; var ids=new LinkedHashSet<String>();
        for(var gate:gates) {
            total+=number(gate,"total",0); passed+=number(gate,"passed",0); blocking+=number(gate,"blockingFailures",0);
            isolated+=number(gate,"quarantinedFailures",0); infra+=number(gate,"infrastructureFailures",0); ids.addAll(strings(gate.get("quarantinedCaseIds")));
        }
        String status=!terminal?"PENDING":gates.stream().anyMatch(g->"BLOCKED".equals(g.get("status")))?"BLOCKED":
                gates.stream().anyMatch(g->"WARN".equals(g.get("status")))?"WARN":"PASSED";
        return map("policy","aggregate-v1","status",status,"total",total,"passed",passed,"blockingFailures",blocking,
                "quarantinedFailures",isolated,"infrastructureFailures",infra,"quarantinedCaseIds",new ArrayList<>(ids));
    }

    static int[] junitCounts(Map<String,Object> snapshot) {
        var gate=cast(snapshot.get("gate"));
        return new int[]{number(gate,"total",0)+number(gate,"infrastructureFailures",0),number(gate,"blockingFailures",0),
                number(gate,"quarantinedFailures",0),number(gate,"infrastructureFailures",0)};
    }

    static String junitSuite(Map<String,Object> snapshot) {
        var counts=junitCounts(snapshot);
        StringBuilder xml=new StringBuilder("<testsuite name=\"").append(escape(str(snapshot,"name"))).append("\" tests=\"").append(counts[0])
                .append("\" failures=\"").append(counts[1]).append("\" skipped=\"").append(counts[2]).append("\" errors=\"").append(counts[3])
                .append("\" time=\"").append(((Number)snapshot.get("durationMs")).longValue()/1000.0).append("\">");
        for(var result:objects(snapshot.get("cases"))) {
            xml.append("<testcase classname=\"smarttest\" name=\"").append(escape(str(result,"name"))).append("\" time=\"").append(number(result,"durationMs",0)/1000.0).append("\">")
                    .append("<properties><property name=\"caseId\" value=\"").append(escape(str(result,"caseId"))).append("\"/><property name=\"originalStatus\" value=\"").append(escape(str(result,"status"))).append("\"/></properties>");
            if("QUARANTINED".equals(result.get("outcome"))) xml.append("<skipped message=\"Quarantined failure: ").append(escape(str(result,"error"))).append("\"/>");
            else if("BLOCKED".equals(result.get("outcome"))) xml.append("<failure message=\"").append(escape(str(result,"error"))).append("\"/>");
            xml.append("<system-out>").append(escape("caseId="+str(result,"caseId")+"; originalStatus="+str(result,"status")+"; "+str(result,"error"))).append("</system-out></testcase>");
        }
        for(String error:strings(snapshot.get("errors"))) xml.append("<testcase classname=\"smarttest.infrastructure\" name=\"").append(escape(error)).append("\"><error message=\"").append(escape(error)).append("\"/></testcase>");
        return xml.append("<system-out>").append(escape(String.join("\n",strings(snapshot.get("logs"))))).append("</system-out></testsuite>").toString();
    }
}
