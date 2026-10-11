package com.smarttest.platform;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.*;
import org.springframework.web.socket.config.annotation.*;
import org.springframework.web.socket.handler.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Configuration
@EnableWebSocket
public class AgentSocket extends TextWebSocketHandler implements WebSocketConfigurer {
    private final PlatformService service;
    private final ObjectMapper json;
    private final Map<String,WebSocketSession> sessions=new ConcurrentHashMap<>();
    private final Map<String,String> registered=new ConcurrentHashMap<>();
    public AgentSocket(PlatformService service,ObjectMapper json) { this.service=service; this.json=json; }
    @PostConstruct void bind() { service.transport(this::send,this::close); }
    @Override public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) { registry.addHandler(this,"/ws/agent").setAllowedOriginPatterns("*"); }
    @Override public void afterConnectionEstablished(WebSocketSession session) { session.setTextMessageSizeLimit(2*1024*1024); sessions.put(session.getId(),new ConcurrentWebSocketSessionDecorator(session,10000,2*1024*1024)); }
    @Override protected void handleTextMessage(WebSocketSession session,TextMessage text) {
        try {
            var message=json.readValue(text.getPayload(),new TypeReference<LinkedHashMap<String,Object>>(){});
            if(!registered.containsKey(session.getId())) {
                if(!"register".equals(message.get("type"))) throw ApiException.unauthorized("First message must register");
                String agent=service.register(session.getId(),message); registered.put(session.getId(),agent);
                service.tick();
            } else { service.agentMessage(session.getId(),message); service.tick(); }
        } catch(Exception e) {
            service.audit(registered.getOrDefault(session.getId(),"unregistered-agent"),"AGENT_MESSAGE_REJECTED","ws/agent",e instanceof ApiException?e.getMessage():"Invalid agent message");
            send(session.getId(),PlatformService.map("type","error","message",e instanceof ApiException?e.getMessage():"Invalid agent message"));
            if(!(e instanceof ApiException api)||api.status.value()==401||api.status.value()==403) close(session.getId());
        }
    }
    @Override public void afterConnectionClosed(WebSocketSession session,CloseStatus status) { registered.remove(session.getId()); sessions.remove(session.getId()); service.disconnect(session.getId()); }
    @Override public void handleTransportError(WebSocketSession session,Throwable exception) { service.disconnect(session.getId()); close(session.getId()); }
    private void send(String id,Map<String,Object> message) { try { var s=sessions.get(id); if(s==null||!s.isOpen())throw new IllegalStateException("Agent disconnected"); s.sendMessage(new TextMessage(json.writeValueAsString(message))); } catch(Exception e) { throw new IllegalStateException("Cannot send agent message",e); } }
    private void close(String id) { try { var s=sessions.remove(id); registered.remove(id); if(s!=null)s.close(CloseStatus.POLICY_VIOLATION); } catch(Exception ignored) {} }
}
