package com.smarttest.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.util.*;

@Configuration
public class SecurityConfig {
    @Bean SecurityFilterChain security(HttpSecurity http,PlatformService platform,ObjectMapper json,@Value("${platform.trust-proxy:false}") boolean trustProxy,@Value("${platform.allow-internal-http:false}") boolean internalHttp) throws Exception {
        http.csrf(c->c.disable()).sessionManagement(s->s.sessionCreationPolicy(SessionCreationPolicy.STATELESS));
        http.authorizeHttpRequests(a->a
            .requestMatchers("/api/health","/api/auth/login","/api/agent/evidence","/ws/agent").permitAll()
            .requestMatchers(HttpMethod.GET,"/api/**").authenticated()
            .requestMatchers("/api/quality/**").hasAnyRole("ADMIN","TESTER")
            .requestMatchers("/api/users/**","/api/agent-keys/**","/api/devices/**").hasRole("ADMIN")
            .requestMatchers("/api/cases/**","/api/plans/**","/api/runs/**","/api/matrices/**").hasAnyRole("ADMIN","TESTER","DEVELOPER")
            .requestMatchers("/api/**").denyAll().anyRequest().permitAll());
        http.exceptionHandling(e->e.authenticationEntryPoint((req,res,ex)->error(json,res,401,"Authentication required"))
            .accessDeniedHandler((req,res,ex)->{
                var auth=SecurityContextHolder.getContext().getAuthentication();
                String actor=auth==null?"anonymous":auth.getName(); platform.audit(actor,"ACCESS_DENIED",req.getRequestURI(),req.getMethod());
                error(json,res,403,"Role does not permit this action");
            }));
        http.headers(h->h.contentSecurityPolicy(c->c.policyDirectives("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'")));
        http.addFilterBefore(new OncePerRequestFilter() {
            @Override protected void doFilterInternal(HttpServletRequest req,HttpServletResponse res,FilterChain chain) throws ServletException,IOException {
                String path=req.getRequestURI();
                if(path.startsWith("/api")||path.equals("/ws/agent")) {
                    res.setHeader("Cache-Control","no-store");
                    if(!path.equals("/api/health")&&!transportAllowed(req.getRemoteAddr(),req.isSecure(),trustProxy,req.getHeader("X-Forwarded-Proto"),internalHttp)) { error(json,res,403,"HTTPS/WSS required for remote access"); return; }
                    String header=req.getHeader("Authorization");
                    if(header!=null&&header.startsWith("Bearer ")) {
                        try {
                            var user=platform.authenticate(header.substring(7));
                            var authentication=new UsernamePasswordAuthenticationToken(user.get("username"),null,List.of(new SimpleGrantedAuthority("ROLE_"+user.get("role"))));
                            authentication.setDetails(user); SecurityContextHolder.getContext().setAuthentication(authentication); req.setAttribute("platform.user",user);
                        } catch(ApiException ex) { error(json,res,401,ex.getMessage()); return; }
                    }
                }
                chain.doFilter(req,res);
            }
        },UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
    static boolean transportAllowed(String remote,boolean secure,boolean trustProxy,String forwarded,boolean internalHttp) {
        if(secure||trustProxy&&"https".equalsIgnoreCase(forwarded)||Set.of("127.0.0.1","::1","0:0:0:0:0:0:0:1").contains(remote)) return true;
        if(!internalHttp||!remote.matches("\\d{1,3}(\\.\\d{1,3}){3}"))return false;
        String[] parts=remote.split("\\."); int[] octets=new int[4];
        for(int i=0;i<4;i++){octets[i]=Integer.parseInt(parts[i]);if(octets[i]>255)return false;}
        return octets[0]==10||octets[0]==172&&octets[1]>=16&&octets[1]<=31||octets[0]==192&&octets[1]==168;
    }
    private static void error(ObjectMapper json,HttpServletResponse res,int status,String message) throws IOException { res.setStatus(status); res.setContentType("application/json"); json.writeValue(res.getOutputStream(),Map.of("message",message)); }
}
