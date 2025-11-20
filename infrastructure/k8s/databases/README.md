# Database Operations Infrastructure

Production-grade monitoring, alerting, backup, and operational tooling for LLM Analytics Hub databases.

## Overview

This infrastructure provides comprehensive database operations capabilities for:
- **TimescaleDB**: PostgreSQL time-series database
- **Redis Cluster**: High-performance caching layer
- **Kafka**: Event streaming platform

## Quick Start

```bash
# Deploy all infrastructure
./deploy-all.sh

# Validate deployment
./validate-all.sh

# Run health checks
make health

# Connect to databases
make connect-ts      # TimescaleDB
make connect-redis   # Redis
make connect-kafka   # Kafka
```

## Features

### Monitoring & Alerting
- 4 Grafana dashboards with 30+ metrics
- 50+ Prometheus alert rules
- Real-time metrics collection (30s interval)

### Backup & Recovery
- TimescaleDB: Daily full + continuous WAL
- Redis: Hourly RDB + continuous AOF
- Kafka: Daily metadata backups
- S3 encrypted storage
- Point-in-time recovery (PITR)
- Monthly automated verification

### Operational Tools
- Health check scripts
- Database connection utilities
- Performance benchmarking
- Automated maintenance

## Documentation

- [Operations Guide](docs/OPERATIONS_GUIDE.md) - Complete manual
- [Backup & Recovery](docs/BACKUP_RECOVERY.md) - Backup procedures
- [Troubleshooting](docs/TROUBLESHOOTING.md) - Common issues
- [Performance Tuning](docs/PERFORMANCE_TUNING.md) - Optimization

## Support

Contact: database-ops@example.com
