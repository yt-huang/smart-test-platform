package com.smarttest.platform;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import org.springframework.http.MediaType;
import java.time.*;
import java.time.format.DateTimeParseException;
import java.util.*;
import static com.smarttest.platform.PlatformService.*;

/** Validates source metadata without inferring, correcting, or generating source times. */
final class EvidenceTimeline {
    private EvidenceTimeline() {}
    record Window(Instant earliest,Instant latest) {}

    static Window window(Map<String,Object> run,Instant current) {
        return new Window(Instant.parse(str(run,"assignedAt")).minusSeconds(300),current.plusSeconds(300));
    }

    static Map<String,Object> capture(ObjectMapper json,String source,String contentType,Map<String,Object> run,Instant current) {
        if(source==null) return null;
        if(source.length()>4000) throw ApiException.bad("capture exceeds 4000 characters");
        Map<String,Object> input;
        try {
            var parsed=json.reader().with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(source);
            if(parsed==null||!parsed.isObject()) throw ApiException.bad("capture must be a JSON object");
            input=json.convertValue(parsed,new TypeReference<LinkedHashMap<String,Object>>(){});
        } catch(ApiException e) { throw e; }
        catch(Exception e) { throw ApiException.bad("Invalid capture JSON"); }
        String kind=choice(input,"kind","",Set.of("screenshot","video","trace","log"));
        if(!matchesType(kind,contentType)) throw ApiException.bad("capture kind does not match evidence contentType");
        String caseId=null;
        if(!kind.equals("log")||input.containsKey("caseId")) {
            caseId=required(input,"caseId",128);
            String ownedCaseId=caseId;
            if(objects(run.get("_cases")).stream().noneMatch(c->ownedCaseId.equals(c.get("id")))) throw ApiException.forbidden("Capture case belongs to another task approval snapshot");
        }
        var capture=map("kind",kind);
        if(caseId!=null) capture.put("caseId",caseId);
        capture.putAll(timing(input,window(run,current),"capture"));
        return capture;
    }

    private static boolean matchesType(String kind,String contentType) {
        try {
            var mime=MediaType.parseMediaType(contentType);
            if(mime.isWildcardType()||mime.isWildcardSubtype()) return false;
            return switch(kind) {
                case "screenshot" -> mime.getType().equalsIgnoreCase("image");
                case "video" -> mime.getType().equalsIgnoreCase("video");
                case "log" -> mime.getType().equalsIgnoreCase("text");
                case "trace" -> mime.getType().equalsIgnoreCase("application")&&Set.of("zip","x-zip-compressed").contains(mime.getSubtype().toLowerCase(Locale.ROOT));
                default -> false;
            };
        } catch(IllegalArgumentException e) { return false; }
    }

    static Map<String,Object> optionalTiming(Map<String,Object> parent,Window window,String label) {
        if(!parent.containsKey("timing")) return null;
        if(!(parent.get("timing") instanceof Map<?,?>)) throw ApiException.bad(label+" timing must be a paired object");
        return timing(cast(parent.get("timing")),window,label+" timing");
    }

    private static Map<String,Object> timing(Map<String,Object> input,Window window,String label) {
        String started=required(input,"startedAt",128),finished=required(input,"finishedAt",128);
        Instant start=parse(started,label),finish=parse(finished,label);
        if(finish.isBefore(start)) throw ApiException.bad(label+" finishedAt precedes startedAt");
        if(start.isBefore(window.earliest())||finish.isAfter(window.latest())) throw ApiException.bad(label+" lies outside assignment clock window");
        return map("startedAt",started,"finishedAt",finished);
    }

    private static Instant parse(String value,String label) {
        try { return OffsetDateTime.parse(value).toInstant(); }
        catch(DateTimeParseException e) { throw ApiException.bad(label+" requires valid ISO timestamps with offsets"); }
    }

    static void contains(Map<String,Object> outer,Map<String,Object> inner,String label) {
        if(parse(str(inner,"startedAt"),label).isBefore(parse(str(outer,"startedAt"),label))
                ||parse(str(inner,"finishedAt"),label).isAfter(parse(str(outer,"finishedAt"),label))) throw ApiException.bad(label+" lies outside case timing");
    }

    static void reference(Map<String,Object> evidence,String caseId,Map<String,Object> caseTiming) {
        if(!(evidence.get("capture") instanceof Map<?,?>)) return;
        var capture=cast(evidence.get("capture"));
        if(capture.containsKey("caseId")&&!caseId.equals(capture.get("caseId"))) throw ApiException.forbidden("Evidence capture belongs to another case");
        if(caseTiming!=null&&Set.of("screenshot","video","trace").contains(str(capture,"kind"))) contains(caseTiming,capture,"Evidence capture");
    }
}
