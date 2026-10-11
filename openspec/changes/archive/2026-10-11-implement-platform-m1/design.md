# Implementation decisions

Reuse Spring Boot 3 + PostgreSQL central monolith. Java 21; React/Vite portal served from central application; external TLS terminates at Codespaces forwarding. H2 local verification only. Initial Agent uses Node rather than proposed Go to share Playwright execution and reduce runtime integration; outbound protocol remains transport-compatible with a later Go binary. Only authenticated approved structured steps execute; arbitrary uploaded code and unattended AI approval are prohibited.

Codespaces uses devcontainer and Compose with platform, PostgreSQL, and an actual browser Agent. User-approved repository publishing is part of delivery. Physical Android/iOS validation, scrcpy/WDA live control, private model inference and cloud device vendor integration require external hardware/services; their delivery status must remain explicit.
