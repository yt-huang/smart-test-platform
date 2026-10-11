package com.smarttest.platform;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/** Concrete portal paths only. API and asset misses keep their normal 404 response. */
@Controller
public class SpaController {
    @GetMapping({"/","/login","/dashboard","/cases","/cases/{id}","/plans","/plans/{id}","/runs","/runs/{id}","/agents","/devices","/settings","/users","/audit"})
    public String portal() { return "forward:/index.html"; }
}
