FROM prom/prometheus:latest

# Copy custom configuration
COPY prometheus.yml /etc/prometheus/prometheus.yml

# Create directory for rules
RUN mkdir -p /etc/prometheus/rules

# Copy alert rules
COPY rules/ /etc/prometheus/rules/

# Set up permissions
USER root
RUN chown -R prometheus:prometheus /etc/prometheus
USER prometheus

# Expose port
EXPOSE 9090

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:9090/-/healthy || exit 1

# Default command
CMD ["--config.file=/etc/prometheus/prometheus.yml", \
     "--storage.tsdb.path=/prometheus", \
     "--web.console.libraries=/etc/prometheus/console_libraries", \
     "--web.console.templates=/etc/prometheus/consoles", \
     "--web.enable-lifecycle", \
     "--web.route-prefix=/"]