# Azure AKS Infrastructure - Project Overview

## Executive Summary

This Terraform project deploys a production-ready Azure Kubernetes Service (AKS) infrastructure optimized for the LLM Analytics Hub platform. The infrastructure is designed with enterprise-grade security, high availability, cost optimization, and operational excellence in mind.

## Key Features

### High Availability
- Multi-zone deployment across 3 availability zones
- Zone-redundant node pools for critical workloads
- Geo-replicated container registry (Premium tier)
- Zone-redundant storage options (Premium_ZRS)
- Load balanced ingress with health probes

### Security
- Azure AD integration with RBAC
- Workload Identity for pod-level authentication
- Private endpoints for ACR and Key Vault
- Network Security Groups with restrictive rules
- Azure Policy for compliance enforcement
- Microsoft Defender for Containers
- Secrets management with Azure Key Vault
- Pod Security Standards enforcement
- Host-based encryption for node pools

### Cost Optimization
- Spot instance node pools (up to 80% savings)
- Cluster autoscaler for dynamic scaling
- Ephemeral OS disks for reduced storage costs
- Right-sized node pools by workload type
- NAT Gateway for reduced egress costs
- Reserved instances support (configure separately)

### Observability
- Azure Monitor Container Insights
- Log Analytics workspace integration
- Application Insights for APM
- Diagnostic settings for all resources
- Custom metric alerts
- Centralized logging
- Performance monitoring

### Operational Excellence
- Infrastructure as Code with Terraform
- Automated maintenance windows
- Automatic security patches
- GitOps ready (Flux support)
- Comprehensive documentation
- Deployment verification scripts
- Makefile for common operations

## Architecture Components

### Compute
- **System Node Pool**: System components (2-5 nodes, Standard_D4s_v5)
- **Application Node Pool**: Application workloads (3-10 nodes, Standard_D8s_v5)
- **Database Node Pool**: Stateful workloads (3-6 nodes, Standard_E8s_v5)
- **Spot Node Pool**: Fault-tolerant batch jobs (0-10 nodes, Standard_D8s_v5)
- **GPU Node Pool**: ML workloads (optional, 0-3 nodes, Standard_NC6s_v3)
- **Monitoring Node Pool**: Observability stack (optional, 3 nodes, Standard_D4s_v5)

### Networking
- **Virtual Network**: 10.0.0.0/16 CIDR
- **AKS Subnet**: 10.0.1.0/24 (supports ~251 IPs)
- **Database Subnet**: 10.0.2.0/24 (for Azure Database services)
- **AppGW Subnet**: 10.0.3.0/24 (optional Application Gateway)
- **Private Endpoints Subnet**: 10.0.4.0/24
- **Service CIDR**: 10.1.0.0/16 (Kubernetes services)
- **DNS Service IP**: 10.1.0.10
- **NAT Gateway**: For secure egress with static IPs
- **Network Policies**: Azure CNI with Azure Network Policy

### Storage
- **Azure Disk CSI Driver**: Block storage for pods
- **Azure File CSI Driver**: Shared filesystem storage
- **Storage Classes**:
  - `managed-standard`: Standard_LRS for general use
  - `managed-premium`: Premium_LRS for performance
  - `managed-premium-retain`: Premium_LRS with retention
  - `managed-premium-zrs`: Premium_ZRS for zone redundancy
  - `azurefile`: Standard shared storage
  - `azurefile-premium`: Premium shared storage
  - `database-premium`: Optimized for databases

### Identity & Access
- **Cluster Managed Identity**: For AKS cluster operations
- **Kubelet Identity**: For pulling images and accessing resources
- **Workload Identities**: For application-level access
- **Azure AD Groups**: Admin, Developer, Viewer roles
- **Service Principal**: Optional for automation

### Security Services
- **Azure Key Vault**: Secrets and certificate management
- **Microsoft Defender**: Container security scanning
- **Azure Policy**: Compliance and governance
- **NSGs**: Network-level security
- **Private Endpoints**: Private connectivity to PaaS services

### Monitoring & Logging
- **Log Analytics Workspace**: Centralized logging (30-730 day retention)
- **Application Insights**: APM and distributed tracing
- **Container Insights**: Container-specific monitoring
- **Diagnostic Settings**: Resource-level diagnostics
- **Action Groups**: Alert routing and notification

### Container Registry
- **Azure Container Registry (Premium)**:
  - Geo-replication support
  - Private endpoint connectivity
  - Content trust (optional)
  - Vulnerability scanning with Defender
  - Webhook support for CI/CD

## File Structure

```
.
├── main.tf                     # Main configuration and providers
├── versions.tf                 # Version constraints
├── variables.tf                # Input variables
├── outputs.tf                  # Output values
├── network.tf                  # VNet, subnets, NSGs
├── aks.tf                      # AKS cluster configuration
├── node-pools.tf               # Node pool definitions
├── identity.tf                 # Managed identities and RBAC
├── security.tf                 # Security services and policies
├── terraform.tfvars.example    # Example variable values
├── backend.hcl.example         # Backend configuration example
├── storage-classes.yaml        # Kubernetes storage classes
├── verify-deployment.sh        # Deployment verification script
├── Makefile                    # Automation tasks
├── README.md                   # Comprehensive documentation
├── DEPLOYMENT_GUIDE.md         # Quick start guide
├── PROJECT_OVERVIEW.md         # This file
└── .gitignore                  # Git ignore patterns
```

## Resource Naming Convention

All resources follow this naming pattern:
```
{resource_prefix}-{environment}-{resource_type}-{optional_suffix}
```

Examples:
- Resource Group: `llmhub-production-rg`
- AKS Cluster: `llmhub-production-aks`
- Container Registry: `llmhubproductionacr<random>`
- Key Vault: `llmhub-production-kv-<random>`
- Log Analytics: `llmhub-production-law-<random>`

## Deployment Environments

### Development
- **Purpose**: Testing and development
- **Cost**: ~$200-300/month
- **Configuration**:
  - Free AKS tier
  - Minimal node counts (1-3 per pool)
  - Basic ACR SKU
  - 30-day log retention
  - No defender enabled
  - No geo-replication

### Staging
- **Purpose**: Pre-production testing
- **Cost**: ~$800-1,000/month
- **Configuration**:
  - Standard AKS tier
  - Moderate node counts (2-5 per pool)
  - Standard ACR SKU
  - 60-day log retention
  - Defender enabled
  - Single region

### Production
- **Purpose**: Production workloads
- **Cost**: ~$2,000-3,000/month (base)
- **Configuration**:
  - Standard AKS tier
  - High availability (3-10 nodes per pool)
  - Premium ACR with geo-replication
  - 90-day log retention
  - Defender enabled
  - Private cluster option
  - Multi-region support

## Scalability

### Node Pool Scaling
- **Horizontal**: Auto-scaling from min to max counts
- **Vertical**: Change VM sizes via Terraform
- **Manual**: Override auto-scaling when needed

### Application Scaling
- **Horizontal Pod Autoscaler (HPA)**: CPU/memory-based scaling
- **Vertical Pod Autoscaler (VPA)**: Resource request optimization
- **KEDA**: Event-driven autoscaling (optional)

### Cluster Scaling
- **Multi-cluster**: Deploy multiple clusters for isolation
- **Multi-region**: Geo-distributed deployments
- **Federation**: Cross-cluster workload management (optional)

## Disaster Recovery

### Backup Strategy
1. **Velero**: Kubernetes resource backup
2. **Azure Backup**: PV snapshots
3. **ACR Replication**: Image redundancy
4. **Terraform State**: Remote state backup

### Recovery Time Objectives
- **RTO**: < 1 hour (with automation)
- **RPO**: < 15 minutes (for data)

### DR Procedures
1. Maintain infrastructure code in version control
2. Regular backup testing (monthly)
3. Documented runbooks
4. Cross-region replication
5. Automated recovery testing

## Compliance & Governance

### Azure Policy
- Pod security restrictions
- Network policy requirements
- Image scanning enforcement
- Resource tagging requirements
- Allowed VM sizes
- Required encryption

### Regulatory Compliance
- **GDPR**: Data residency and privacy
- **HIPAA**: Healthcare data protection (if applicable)
- **SOC 2**: Security controls and monitoring
- **ISO 27001**: Information security management

### Audit Logging
- All API calls logged to Log Analytics
- Kubernetes audit logs enabled
- Resource change tracking
- Compliance dashboard in Azure Security Center

## Cost Management

### Monthly Cost Breakdown (Production)

| Component | Configuration | Cost (USD) |
|-----------|--------------|-----------|
| AKS Management | Standard tier | $73 |
| System Nodes | 3x D4s_v5 | $280 |
| App Nodes | 3x D8s_v5 | $560 |
| DB Nodes | 3x E8s_v5 | $600 |
| Spot Nodes | Variable | $0-200 |
| ACR Premium | 500GB | $200 |
| Log Analytics | 10GB/day | $150 |
| NAT Gateway | 3 zones | $100 |
| Load Balancer | Standard | $20 |
| Key Vault | Transactions | $10 |
| Defender | Per node | $30 |
| **Subtotal** | | **~$2,023** |
| **Egress** | ~500GB | $40 |
| **Total** | | **~$2,063/month** |

### Cost Optimization Strategies
1. **Use spot instances** for batch workloads (80% savings)
2. **Enable autoscaling** to scale down during off-hours
3. **Right-size VMs** based on actual usage
4. **Use reservations** for predictable workloads (72% savings)
5. **Optimize egress** with CDN and caching
6. **Archive old logs** to cheaper storage tiers
7. **Use lifecycle policies** for ACR images

## Performance Tuning

### Network Performance
- Azure CNI for optimal pod-to-pod communication
- Premium disk for low-latency storage
- Accelerated networking enabled on VMs
- NAT Gateway for consistent egress performance

### Storage Performance
- Premium SSD for databases (up to 20,000 IOPS)
- Ephemeral OS disks for node performance
- ZRS for zone-redundant high availability
- ReadWrite caching for frequent reads

### Application Performance
- Node affinity for co-location
- Topology spread constraints
- Pod priority and preemption
- Resource quotas and limits

## Security Hardening

### Network Security
- Private cluster API server (optional)
- Network policies for pod-to-pod communication
- NSG rules for subnet isolation
- Private endpoints for PaaS services
- Azure Firewall for egress filtering (optional)

### Identity Security
- Azure AD integration with MFA
- RBAC with least privilege principle
- Workload identity instead of service principals
- Regular credential rotation
- Audit logging for all access

### Container Security
- Image scanning with Defender
- Admission controllers for policy enforcement
- Read-only root filesystems
- Non-root containers
- Security context constraints

### Data Security
- Encryption at rest (all storage)
- Encryption in transit (TLS everywhere)
- Key Vault for secrets management
- Customer-managed keys (optional)
- Data residency compliance

## Maintenance & Operations

### Maintenance Windows
- **Kubernetes Upgrades**: Sundays 00:00-06:00 UTC
- **Node OS Updates**: Saturdays 00:00-04:00 UTC
- **Blackout Periods**: Major holidays excluded

### Update Strategy
- **Control Plane**: Automatic with maintenance windows
- **Node Pools**: Rolling updates with surge capacity
- **Applications**: Blue-green or canary deployments

### Monitoring Dashboards
1. Cluster health and capacity
2. Application performance metrics
3. Security and compliance status
4. Cost and resource utilization
5. Custom business metrics

## Troubleshooting Guide

### Common Issues

**Nodes Not Ready**
- Check node pool status in Azure Portal
- Review node system logs
- Verify network connectivity
- Check resource quotas

**Pods Pending**
- Insufficient resources
- Node selector mismatch
- Taints/tolerations issues
- PV provisioning failures

**Networking Issues**
- Network policy blocking traffic
- NSG rules too restrictive
- DNS resolution failures
- Service endpoint issues

**Authentication Failures**
- Azure AD token expired
- RBAC permissions insufficient
- Workload identity misconfigured
- Service principal issues

## Best Practices

### Infrastructure as Code
- ✓ All changes via Terraform
- ✓ Code review for all changes
- ✓ Automated testing in dev
- ✓ Plan before apply
- ✓ Remote state with locking

### Deployment
- ✓ Use environment-specific tfvars
- ✓ Validate before deploying
- ✓ Deploy to dev first
- ✓ Verify after deployment
- ✓ Document all changes

### Security
- ✓ Enable all security features
- ✓ Regular security scans
- ✓ Patch management
- ✓ Access auditing
- ✓ Incident response plan

### Operations
- ✓ Monitor everything
- ✓ Alert on anomalies
- ✓ Regular backups
- ✓ Test disaster recovery
- ✓ Document procedures

## Future Enhancements

### Planned Features
- [ ] Azure Front Door for global load balancing
- [ ] Azure Service Mesh (Istio/Linkerd)
- [ ] KEDA for event-driven autoscaling
- [ ] ArgoCD for GitOps deployments
- [ ] Prometheus + Grafana stack
- [ ] Fluentd/Fluent Bit for log aggregation
- [ ] Velero for backup/restore
- [ ] External Secrets Operator
- [ ] OPA Gatekeeper for policy enforcement

### Technology Roadmap
- Migrate to Kubernetes 1.29+
- Implement service mesh
- Advanced network policies (Calico)
- Multi-cluster management
- Edge computing support

## Getting Started

1. **Review Prerequisites**: README.md
2. **Configure Variables**: terraform.tfvars
3. **Deploy Infrastructure**: DEPLOYMENT_GUIDE.md
4. **Verify Deployment**: Run verify-deployment.sh
5. **Deploy Applications**: Use kubectl/Helm
6. **Configure Monitoring**: Azure Portal
7. **Set Up Alerts**: Azure Monitor
8. **Implement Backup**: Velero setup

## Support & Resources

### Documentation
- [Azure AKS Documentation](https://docs.microsoft.com/azure/aks/)
- [Terraform Azure Provider](https://registry.terraform.io/providers/hashicorp/azurerm/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)

### Tools
- [Azure CLI](https://docs.microsoft.com/cli/azure/)
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- [Helm](https://helm.sh/docs/)
- [Terraform](https://www.terraform.io/docs/)

### Community
- [Azure AKS GitHub](https://github.com/Azure/AKS)
- [Kubernetes Slack](https://kubernetes.slack.com/)
- [Terraform Community](https://discuss.hashicorp.com/)

## License

Apache 2.0 License - See LICENSE file for details.

## Contributors

This infrastructure is maintained by the LLM Analytics Hub platform team.

For questions, issues, or contributions, please open an issue in the project repository.
