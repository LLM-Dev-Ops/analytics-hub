# AWS EKS Infrastructure - Complete Index

## Quick Navigation

### Getting Started
- [QUICKSTART.md](QUICKSTART.md) - 5-minute setup guide
- [README.md](README.md) - Complete documentation
- [DEPLOYMENT_SUMMARY.md](DEPLOYMENT_SUMMARY.md) - What was created

### Technical Documentation
- [INFRASTRUCTURE_OVERVIEW.md](INFRASTRUCTURE_OVERVIEW.md) - Architecture and components
- [INDEX.md](INDEX.md) - This file

## File Organization

### Core Infrastructure Files

#### Main Configuration
| File | Lines | Purpose |
|------|-------|---------|
| [main.tf](main.tf) | 62 | Terraform providers, data sources, local variables |
| [variables.tf](variables.tf) | 328 | Input variables with validation |
| [outputs.tf](outputs.tf) | 199 | Output values for cluster info |

#### Networking
| File | Lines | Purpose |
|------|-------|---------|
| [vpc.tf](vpc.tf) | 184 | VPC, subnets, NAT gateways, VPC endpoints |

#### Compute
| File | Lines | Purpose |
|------|-------|---------|
| [eks.tf](eks.tf) | 149 | EKS cluster, add-ons, logging |
| [node-groups.tf](node-groups.tf) | 321 | System, application, database node groups |

#### Security
| File | Lines | Purpose |
|------|-------|---------|
| [iam.tf](iam.tf) | 386 | IAM roles, policies, IRSA, KMS keys |
| [security-groups.tf](security-groups.tf) | 249 | Security groups and rules |

### Configuration Files

| File | Purpose |
|------|---------|
| [terraform.tfvars.example](terraform.tfvars.example) | Example configuration values |
| [backend.hcl.example](backend.hcl.example) | S3 backend configuration |
| [.terraform-version](.terraform-version) | Terraform version constraint |
| [.gitignore](.gitignore) | Git ignore patterns |

### Automation

#### Scripts
| Script | Purpose | Usage |
|--------|---------|-------|
| [scripts/setup.sh](scripts/setup.sh) | Initial setup | `./scripts/setup.sh` |
| [scripts/deploy.sh](scripts/deploy.sh) | Deploy infrastructure | `./scripts/deploy.sh` |
| [scripts/destroy.sh](scripts/destroy.sh) | Destroy infrastructure | `./scripts/destroy.sh` |
| [scripts/install-addons.sh](scripts/install-addons.sh) | Install cluster add-ons | `./scripts/install-addons.sh` |
| [scripts/validate.sh](scripts/validate.sh) | Validate configuration | `./scripts/validate.sh` |

#### Build Tool
| File | Purpose |
|------|---------|
| [Makefile](Makefile) | Build automation with 40+ targets |

### Supporting Files

| Directory | File | Purpose |
|-----------|------|---------|
| templates/ | [userdata.sh.tpl](templates/userdata.sh.tpl) | Node bootstrap script |
| policies/ | [aws-load-balancer-controller-policy.json](policies/aws-load-balancer-controller-policy.json) | ALB controller IAM policy |

## Common Workflows

### Initial Setup
```bash
# Read the quick start
cat QUICKSTART.md

# Run setup script
make setup

# Edit configuration
vim terraform.tfvars
```

### Deployment
```bash
# Validate configuration
make validate

# Create plan
make plan

# Deploy
make apply

# Or use automated deployment
make deploy
```

### Post-Deployment
```bash
# Configure kubectl
make kubeconfig

# Install add-ons
make addons

# Verify
make k8s-test
```

### Maintenance
```bash
# Update infrastructure
make plan
make apply

# View current state
make output

# Validate changes
make validate
```

### Destruction
```bash
# Destroy all infrastructure
make destroy
```

## Documentation Guide

### For First-Time Users
1. Start with [QUICKSTART.md](QUICKSTART.md)
2. Read the prerequisites section
3. Follow the 5-minute setup
4. Deploy your first cluster

### For Infrastructure Engineers
1. Review [INFRASTRUCTURE_OVERVIEW.md](INFRASTRUCTURE_OVERVIEW.md)
2. Understand the architecture
3. Read security best practices
4. Review cost optimization strategies

### For Operators
1. Read [README.md](README.md) maintenance section
2. Understand troubleshooting procedures
3. Review monitoring setup
4. Study disaster recovery procedures

### For Developers
1. Read [QUICKSTART.md](QUICKSTART.md) deployment section
2. Understand node group configurations
3. Review storage classes
4. Study application deployment examples

## File Statistics

### Code Distribution
- **Terraform**: 2,066 lines
- **Scripts**: 1,139 lines
- **Documentation**: 45,000+ characters
- **Total Files**: 23

### By Category
- **Core Infrastructure**: 8 Terraform files
- **Configuration**: 4 files
- **Scripts**: 5 files
- **Documentation**: 5 files
- **Supporting**: 2 files

## Key Concepts

### Infrastructure Components
- **VPC**: Private network for EKS
- **EKS Cluster**: Managed Kubernetes control plane
- **Node Groups**: Worker node pools
- **IRSA**: IAM roles for service accounts
- **VPC Endpoints**: Private AWS service access

### Node Groups
- **System**: Critical cluster components (m5.xlarge)
- **Application**: Application workloads (m5.2xlarge Spot)
- **Database**: Stateful workloads (r5.2xlarge)

### Security Layers
1. Network (VPC, Security Groups)
2. IAM (Roles, Policies, IRSA)
3. Encryption (KMS, TLS)
4. Logging (CloudWatch, VPC Flow Logs)
5. Monitoring (Container Insights)

## Quick Reference

### Makefile Targets
```bash
make help              # Show all targets
make setup             # Initial setup
make validate          # Validate configuration
make plan              # Create execution plan
make apply             # Apply changes
make deploy            # Full deployment
make destroy           # Destroy infrastructure
make addons            # Install add-ons
make kubeconfig        # Configure kubectl
make k8s-test          # Test cluster access
make output            # Show outputs
```

### Important Outputs
```bash
# Get cluster name
terraform output cluster_name

# Get cluster endpoint
terraform output cluster_endpoint

# Get configure kubectl command
terraform output configure_kubectl

# Get all outputs
terraform output -json
```

### Common kubectl Commands
```bash
kubectl get nodes                    # List nodes
kubectl get pods -A                  # List all pods
kubectl get svc -A                   # List all services
kubectl top nodes                    # Node metrics
kubectl top pods -A                  # Pod metrics
kubectl cluster-info                 # Cluster info
kubectl get events -A --sort-by='.lastTimestamp'  # Recent events
```

## Troubleshooting Quick Reference

### Issue: Can't connect to cluster
```bash
# Update kubeconfig
make kubeconfig

# Verify AWS credentials
aws sts get-caller-identity

# Check cluster status
aws eks describe-cluster --name $(terraform output -raw cluster_name)
```

### Issue: Nodes not joining
```bash
# Check CloudWatch logs
aws logs tail /aws/eks/$(terraform output -raw cluster_name)/cluster --follow

# Verify security groups
terraform output cluster_security_group_id
terraform output node_security_group_id
```

### Issue: Pods not scheduling
```bash
# Check node resources
kubectl top nodes

# Check pod events
kubectl get events -A --sort-by='.lastTimestamp'

# Verify taints
kubectl get nodes -o json | jq '.items[].spec.taints'
```

## Resource Locations

### AWS Console
- **EKS Cluster**: EKS Console → Clusters → llm-analytics-hub-prod-eks
- **VPC**: VPC Console → Your VPCs → llm-analytics-hub-prod-eks-vpc
- **CloudWatch Logs**: CloudWatch → Logs → /aws/eks/llm-analytics-hub-prod-eks
- **IAM Roles**: IAM Console → Roles → Filter: llm-analytics-hub

### Terraform State
- **Local**: `terraform.tfstate` (if not using backend)
- **Remote**: S3 bucket specified in `backend.hcl`

### Logs
- **Cluster Logs**: CloudWatch → /aws/eks/{cluster-name}/cluster
- **VPC Flow Logs**: CloudWatch → /aws/vpc/{cluster-name}
- **Application Logs**: Depending on application configuration

## Version Information

| Component | Version |
|-----------|---------|
| Terraform | >= 1.6.0 |
| AWS Provider | ~> 5.0 |
| Kubernetes Provider | ~> 2.23 |
| Helm Provider | ~> 2.11 |
| Kubernetes | 1.28 |

## Support Contacts

- **Documentation Issues**: Update this repository
- **Infrastructure Issues**: Platform team
- **AWS Issues**: AWS Support
- **Application Issues**: Development team

## Additional Resources

### Internal
- [Project README](/workspaces/llm-analytics-hub/README.md)
- [K8s Configurations](/workspaces/llm-analytics-hub/k8s/)
- [Monitoring Setup](/workspaces/llm-analytics-hub/infrastructure/monitoring/)

### External
- [AWS EKS Documentation](https://docs.aws.amazon.com/eks/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [AWS EKS Best Practices](https://aws.github.io/aws-eks-best-practices/)

## Glossary

- **AZ**: Availability Zone
- **ALB**: Application Load Balancer
- **CNI**: Container Network Interface
- **EBS**: Elastic Block Store
- **ECR**: Elastic Container Registry
- **EKS**: Elastic Kubernetes Service
- **IRSA**: IAM Roles for Service Accounts
- **KMS**: Key Management Service
- **NAT**: Network Address Translation
- **OIDC**: OpenID Connect
- **VPC**: Virtual Private Cloud

---

**Last Updated**: 2024-11-20
**Maintained By**: Platform Engineering Team
**Version**: 1.0.0
