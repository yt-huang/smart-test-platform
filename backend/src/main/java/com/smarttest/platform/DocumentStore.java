package com.smarttest.platform;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.*;

@Repository
public class DocumentStore {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    public DocumentStore(JdbcTemplate jdbc, ObjectMapper json) { this.jdbc=jdbc; this.json=json; }
    public Map<String,Object> get(String kind, String id) {
        var rows=jdbc.query("SELECT payload FROM platform_documents WHERE kind=? AND id=? AND workspace_id='default'", (rs,n)->decode(rs.getString(1)),kind,id);
        if(rows.isEmpty()) throw ApiException.missing();
        return rows.getFirst();
    }
    public List<Map<String,Object>> list(String kind) {
        return jdbc.query("SELECT payload FROM platform_documents WHERE kind=? AND workspace_id='default'",(rs,n)->decode(rs.getString(1)),kind);
    }
    public void save(String kind, Map<String,Object> value) {
        String encoded;
        try { encoded=json.writeValueAsString(value); } catch(Exception e) { throw new IllegalStateException(e); }
        int updated=jdbc.update("UPDATE platform_documents SET payload=? WHERE id=? AND kind=? AND workspace_id='default'",encoded,value.get("id"),kind);
        if(updated==0) jdbc.update("INSERT INTO platform_documents(id,kind,workspace_id,payload) VALUES(?,?,'default',?)",value.get("id"),kind,encoded);
    }
    public void delete(String kind,String id) { jdbc.update("DELETE FROM platform_documents WHERE kind=? AND id=? AND workspace_id='default'",kind,id); }
    private Map<String,Object> decode(String data) {
        try { return json.readValue(data,new TypeReference<LinkedHashMap<String,Object>>(){}); } catch(Exception e) { throw new IllegalStateException(e); }
    }
}
