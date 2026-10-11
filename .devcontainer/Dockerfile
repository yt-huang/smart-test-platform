FROM mcr.microsoft.com/devcontainers/java:1-21-bookworm

# This application uses npm. The inherited optional Yarn apt source has an
# expired signing key and blocks unrelated Docker feature installation.
USER root
RUN rm -f /etc/apt/sources.list.d/yarn.list /etc/apt/sources.list.d/yarn.sources
