# Makefile for Database Operations

.PHONY: help deploy validate health connect-ts connect-redis connect-kafka

NAMESPACE ?= llm-analytics-hub

help:
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@echo '  deploy          Deploy all database operations infrastructure'
	@echo '  validate        Validate deployment'
	@echo '  health          Run health checks'
	@echo '  connect-ts      Connect to TimescaleDB'
	@echo '  connect-redis   Connect to Redis'
	@echo '  connect-kafka   Connect to Kafka'
	@echo '  backup-ts       Trigger TimescaleDB backup manually'
	@echo '  verify-backup   Verify backups'
	@echo '  status          Show status of all components'

deploy:
	@./deploy-all.sh

validate:
	@./validate-all.sh

health:
	@./operations/health-check.sh

connect-ts:
	@./utils/connect-timescaledb.sh

connect-redis:
	@./utils/connect-redis.sh

connect-kafka:
	@./utils/connect-kafka.sh

backup-ts:
	@kubectl create job --from=cronjob/timescaledb-backup timescaledb-backup-manual-$(shell date +%Y%m%d%H%M%S) -n $(NAMESPACE)

status:
	@kubectl get pods -n $(NAMESPACE) -l component=database
	@kubectl get cronjobs -n $(NAMESPACE) -l component=backup
