# LLM Analytics Hub - AWS EKS Infrastructure Overview

## Executive Summary

This document provides a comprehensive overview of the production-ready AWS EKS infrastructure for the LLM Analytics Hub platform.

### Infrastructure Highlights

- **High Availability**: Multi-AZ deployment across 3 availability zones
- **Auto-Scaling**: 3-19 nodes (configurable) with Cluster Autoscaler
- **Security**: Encrypted at rest, IRSA, VPC endpoints, least privilege IAM
- **Cost-Optimized**: Spot instances for applications, right-sized node groups
- **Production-Ready**: CloudWatch monitoring, audit logging, disaster recovery

### Estimated Monthly Cost

| Component | Configuration | Monthly Cost |
|-----------|--------------|--------------|
| EKS Control Plane | 1 cluster | $72 |
| NAT Gateways | 3 (HA) | $97 |
| System Nodes | 3x m5.xlarge (ON_DEMAND) | $374 |
| Application Nodes | 5x m5.2xlarge (SPOT) | $310 |
| Database Nodes | 4x r5.2xlarge (ON_DEMAND) | $1,169 |
| Data Transfer | Estimated | $100 |
| **Total** | | **~$2,022** |

*Cost savings with Spot instances: ~$800/month (70% on application nodes)*

## Architecture Components

### 1. Networking (vpc.tf)

#### VPC Configuration
- **CIDR**: 10.0.0.0/16 (customizable)
- **Subnets**: 9 total (3 public, 3 private, 3 intra)
- **NAT Gateways**: 3 (one per AZ for HA)
- **DNS**: Enabled (hostnames and resolution)

#### Subnet Layout
```
┌─────────────────────────────────────────────┐
│ AZ us-east-1a                               │
├─────────────────────────────────────────────┤
│ Public:  10.0.48.0/24  (NAT Gateway)       │
│ Private: 10.0.0.0/20   (EKS Nodes)         │
│ Intra:   10.0.52.0/24  (Internal only)     │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ AZ us-east-1b                               │
├─────────────────────────────────────────────┤
│ Public:  10.0.49.0/24  (NAT Gateway)       │
│ Private: 10.0.16.0/20  (EKS Nodes)         │
│ Intra:   10.0.53.0/24  (Internal only)     │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ AZ us-east-1c                               │
├─────────────────────────────────────────────┤
│ Public:  10.0.50.0/24  (NAT Gateway)       │
│ Private: 10.0.32.0/20  (EKS Nodes)         │
│ Intra:   10.0.54.0/24  (Internal only)     │
└─────────────────────────────────────────────┘
```

#### VPC Endpoints
Cost-effective and secure access to AWS services:
- **S3** (Gateway): Free, no data transfer charges
- **ECR API** (Interface): Container image registry
- **ECR DKR** (Interface): Docker registry
- **EC2** (Interface): Instance metadata
- **CloudWatch Logs** (Interface): Logging
- **STS** (Interface): IAM token service
- **ELB** (Interface): Load balancer API
- **Auto Scaling** (Interface): Node scaling

**Benefits**:
- Reduced NAT Gateway costs
- Improved security (traffic stays in VPC)
- Lower latency
- Better compliance posture

#### VPC Flow Logs
- **Destination**: CloudWatch Logs
- **Retention**: 14 days (configurable)
- **Format**: Standard AWS flow log format
- **Use Cases**: Network troubleshooting, security analysis

### 2. EKS Cluster (eks.tf)

#### Control Plane
- **Kubernetes Version**: 1.28+ (configurable)
- **Endpoint Access**:
  - Public: Yes (with CIDR restrictions)
  - Private: Yes
- **Encryption**: KMS envelope encryption for secrets
- **Platform Version**: Latest (auto-updated by AWS)

#### Control Plane Logging
Enabled for all log types:
- **API Server**: All API requests
- **Audit**: Audit logs for compliance
- **Authenticator**: Authentication attempts
- **Controller Manager**: Controller operations
- **Scheduler**: Scheduling decisions

**Retention**: 30 days in CloudWatch Logs

#### Managed Add-ons
- **VPC-CNI**: Latest version, pod networking
- **CoreDNS**: DNS service for the cluster
- **kube-proxy**: Network proxy on each node
- **EBS CSI Driver**: Persistent volume support

### 3. Node Groups (node-groups.tf)

#### System Node Group
**Purpose**: Critical cluster components

| Specification | Value |
|--------------|-------|
| Instance Type | m5.xlarge |
| vCPU | 4 |
| Memory | 16GB |
| Capacity Type | ON_DEMAND |
| Min Nodes | 2 |
| Desired Nodes | 3 |
| Max Nodes | 4 |
| Disk Size | 100GB gp3 |
| Disk IOPS | 3000 |

**Workloads**:
- CoreDNS
- kube-proxy
- AWS VPC CNI
- Metrics Server
- Cluster Autoscaler
- AWS Load Balancer Controller

#### Application Node Group
**Purpose**: Application workloads

| Specification | Value |
|--------------|-------|
| Instance Types | m5.2xlarge, m5a.2xlarge, m5n.2xlarge |
| vCPU | 8 |
| Memory | 32GB |
| Capacity Type | SPOT (70% savings) |
| Min Nodes | 3 |
| Desired Nodes | 5 |
| Max Nodes | 10 |
| Disk Size | 200GB gp3 |
| Disk IOPS | 3000 |

**Workloads**:
- API servers
- Web applications
- Microservices
- Background workers
- LLM processing services

**Spot Instance Configuration**:
- Multiple instance types for availability
- Graceful handling of interruptions
- Cost savings: ~70%

#### Database Node Group
**Purpose**: Stateful workloads

| Specification | Value |
|--------------|-------|
| Instance Type | r5.2xlarge (memory-optimized) |
| vCPU | 8 |
| Memory | 64GB |
| Capacity Type | ON_DEMAND |
| Min Nodes | 3 |
| Desired Nodes | 4 |
| Max Nodes | 6 |
| Disk Size | 500GB gp3 |
| Disk IOPS | 3000 |
| Disk Throughput | 125 MiB/s |

**Workloads**:
- PostgreSQL
- InfluxDB
- Redis
- TimescaleDB
- Other stateful services

**Taints**:
```yaml
- key: workload
  value: database
  effect: NoSchedule
```

This ensures only database pods with matching tolerations run on these nodes.

### 4. IAM & Security (iam.tf, security-groups.tf)

#### IAM Roles

##### EKS Cluster Role
- **Purpose**: EKS control plane operations
- **Policies**:
  - AmazonEKSClusterPolicy
  - AmazonEKSVPCResourceController
  - Custom encryption policy (if enabled)

##### Node IAM Role
- **Purpose**: EC2 instances in node groups
- **Policies**:
  - AmazonEKSWorkerNodePolicy
  - AmazonEKS_CNI_Policy
  - AmazonEC2ContainerRegistryReadOnly
  - AmazonSSMManagedInstanceCore
  - Custom CloudWatch policy
  - Custom EBS policy

##### IRSA Roles (IAM Roles for Service Accounts)

1. **EBS CSI Driver**
   - Service Account: `ebs-csi-controller-sa`
   - Namespace: `kube-system`
   - Policy: AmazonEBSCSIDriverPolicy

2. **Cluster Autoscaler**
   - Service Account: `cluster-autoscaler`
   - Namespace: `kube-system`
   - Policy: Custom autoscaling policy

3. **AWS Load Balancer Controller**
   - Service Account: `aws-load-balancer-controller`
   - Namespace: `kube-system`
   - Policy: Custom load balancer policy

#### Security Groups

##### Cluster Security Group
- **Ingress**:
  - Port 443 from allowed CIDRs (API access)
  - Port 443 from node security group
- **Egress**: All traffic

##### Node Security Group
- **Ingress**:
  - All traffic from self (node-to-node)
  - Port 443 from cluster SG (kubelet)
  - Port 10250 from cluster SG (kubelet metrics)
  - Ports 1025-65535 from cluster SG (node ports)
  - All traffic from ALB SG
- **Egress**: All traffic

##### VPC Endpoints Security Group
- **Ingress**: Port 443 from VPC CIDR
- **Egress**: All traffic

##### Database Security Group
- **Ingress**:
  - Port 5432 (PostgreSQL)
  - Port 8086 (InfluxDB)
  - Port 6379 (Redis)
- **Egress**: All traffic

##### ALB Security Group
- **Ingress**:
  - Port 80 (HTTP)
  - Port 443 (HTTPS)
- **Egress**: All traffic

#### KMS Encryption
- **Purpose**: Encrypt Kubernetes secrets
- **Key Rotation**: Enabled (automatic annual rotation)
- **Deletion Window**: 7 days
- **Alias**: `alias/llm-analytics-hub-prod-eks`

### 5. Storage Configuration

#### Storage Classes

##### gp3 (Default)
```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  iops: "3000"
  throughput: "125"
  encrypted: "true"
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
```

**Use Cases**:
- General purpose workloads
- Application data
- Temporary storage

**Performance**: Up to 16,000 IOPS, 1,000 MiB/s throughput

##### io2 (High Performance)
```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: io2
provisioner: ebs.csi.aws.com
parameters:
  type: io2
  iops: "10000"
  encrypted: "true"
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
```

**Use Cases**:
- High-performance databases
- Critical applications
- Low-latency requirements

**Performance**: Up to 64,000 IOPS, 1,000 MiB/s throughput

##### gp3-retain (Persistent)
Same as gp3 but with `reclaimPolicy: Retain` for data preservation.

### 6. Monitoring & Logging

#### CloudWatch Container Insights
- **Metrics**: Cluster, node, pod, container level
- **Logs**: Application and system logs
- **Performance**: CPU, memory, disk, network
- **Dashboards**: Pre-built CloudWatch dashboards

#### Control Plane Logs
All logs sent to CloudWatch Logs:
- `/aws/eks/llm-analytics-hub-prod-eks/cluster`

Log streams:
- `kube-apiserver-<hash>`
- `kube-controller-manager-<hash>`
- `kube-scheduler-<hash>`
- `authenticator-<hash>`
- `cloud-controller-manager-<hash>`

#### VPC Flow Logs
Network traffic analysis:
- Source/destination IPs
- Ports and protocols
- Accept/reject decisions
- Bytes transferred

### 7. Auto-Scaling

#### Cluster Autoscaler
Automatically adjusts node count based on:
- Pending pods (scale up)
- Underutilized nodes (scale down)
- Resource requests and limits

**Configuration**:
- Scale-up delay: 10 seconds
- Scale-down delay: 10 minutes
- Max node provision time: 15 minutes
- Scale-down utilization threshold: 50%

#### Horizontal Pod Autoscaler (HPA)
Scales pods based on:
- CPU utilization
- Memory utilization
- Custom metrics

**Requirements**:
- Metrics Server installed
- Resource requests defined
- HPA manifest created

## File Structure

```
infrastructure/terraform/aws/
├── main.tf                          # Main configuration, providers
├── variables.tf                     # Input variables
├── outputs.tf                       # Output values
├── terraform.tfvars.example         # Example variable values
├── backend.hcl.example              # Backend configuration example
├── .terraform-version               # Terraform version constraint
├── .gitignore                       # Git ignore rules
├── Makefile                         # Build automation
├── README.md                        # Full documentation
├── QUICKSTART.md                    # Quick start guide
├── INFRASTRUCTURE_OVERVIEW.md       # This file
│
├── VPC & Networking
│   └── vpc.tf                       # VPC, subnets, NAT, endpoints
│
├── EKS Cluster
│   └── eks.tf                       # Cluster, add-ons, auth
│
├── Compute
│   └── node-groups.tf               # System, app, database nodes
│
├── Security
│   ├── iam.tf                       # IAM roles, policies, IRSA
│   └── security-groups.tf           # Security groups, rules
│
├── Supporting Files
│   ├── policies/
│   │   └── aws-load-balancer-controller-policy.json
│   ├── templates/
│   │   └── userdata.sh.tpl          # Node bootstrap script
│   └── scripts/
│       ├── setup.sh                 # Initial setup script
│       ├── deploy.sh                # Deployment script
│       ├── destroy.sh               # Destruction script
│       └── install-addons.sh        # Add-ons installation
```

## Deployment Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Prerequisites                                            │
│    - AWS CLI configured                                     │
│    - Terraform installed                                    │
│    - kubectl installed                                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Setup (make setup)                                       │
│    - Create S3 backend bucket                               │
│    - Create DynamoDB state lock table                       │
│    - Initialize Terraform                                   │
│    - Create terraform.tfvars from example                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Configure (edit terraform.tfvars)                        │
│    - Set project name and environment                       │
│    - Configure VPC CIDR                                     │
│    - Set node group sizes                                   │
│    - Configure IAM mappings                                 │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Plan (make plan)                                         │
│    - Review infrastructure changes                          │
│    - Verify resource counts                                 │
│    - Estimate costs                                         │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Deploy (make apply)                                      │
│    - Create VPC and networking (5 min)                      │
│    - Create EKS cluster (10 min)                            │
│    - Create node groups (5 min)                             │
│    - Configure security and IAM                             │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Configure kubectl (make kubeconfig)                      │
│    - Update local kubeconfig                                │
│    - Verify cluster access                                  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Install Add-ons (make addons)                            │
│    - Metrics Server                                         │
│    - Cluster Autoscaler                                     │
│    - AWS Load Balancer Controller                           │
│    - Storage Classes                                        │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. Deploy Applications                                      │
│    - Create namespaces                                      │
│    - Deploy services                                        │
│    - Configure ingress                                      │
└─────────────────────────────────────────────────────────────┘
```

## Security Best Practices

### Network Security
- ✓ Private subnets for all nodes
- ✓ VPC endpoints reduce internet exposure
- ✓ Security groups with least privilege
- ✓ Network policies (to be configured)

### Access Control
- ✓ IRSA for pod-level IAM permissions
- ✓ RBAC for Kubernetes authorization
- ✓ IAM authentication for cluster access
- ✓ MFA required for sensitive operations (recommended)

### Data Protection
- ✓ Encryption at rest (KMS)
- ✓ Encryption in transit (TLS)
- ✓ Encrypted EBS volumes
- ✓ Secrets management (AWS Secrets Manager recommended)

### Audit & Compliance
- ✓ Control plane logging enabled
- ✓ VPC Flow Logs enabled
- ✓ CloudWatch monitoring
- ✓ Cost allocation tags

### Hardening Checklist
- [ ] Restrict public endpoint access to specific CIDRs
- [ ] Enable Pod Security Policies/Admission
- [ ] Implement Network Policies
- [ ] Configure AWS WAF for ALBs
- [ ] Enable GuardDuty for threat detection
- [ ] Implement secrets rotation
- [ ] Configure backup solutions
- [ ] Set up security scanning (Trivy, Falco)

## Disaster Recovery

### Backup Strategy

#### Cluster Configuration
```bash
# Automated backups via Terraform state
terraform state pull > backup/terraform.tfstate.$(date +%Y%m%d)

# Cluster configuration
aws eks describe-cluster --name $CLUSTER_NAME > backup/cluster-$(date +%Y%m%d).json
```

#### Kubernetes Resources
```bash
# All resources
kubectl get all --all-namespaces -o yaml > backup/k8s-all-$(date +%Y%m%d).yaml

# Specific namespaces
for ns in $(kubectl get ns -o name | cut -d/ -f2); do
  kubectl get all -n $ns -o yaml > backup/k8s-$ns-$(date +%Y%m%d).yaml
done
```

#### Persistent Data
- EBS snapshots (automated via Data Lifecycle Manager)
- Application-level backups (database dumps, etc.)
- S3 bucket versioning for application data

### Recovery Procedures

#### Complete Cluster Recovery
```bash
# 1. Restore Terraform state
terraform state push backup/terraform.tfstate.YYYYMMDD

# 2. Re-apply infrastructure
terraform apply

# 3. Restore Kubernetes resources
kubectl apply -f backup/k8s-all-YYYYMMDD.yaml

# 4. Restore persistent volumes from snapshots
kubectl apply -f backup/pvcs-YYYYMMDD.yaml
```

#### Node Group Recovery
```bash
# Recreate specific node group
terraform taint aws_eks_node_group.application
terraform apply
```

## Performance Tuning

### Node Configuration
- Instance types optimized for workload
- Enhanced networking enabled
- EBS-optimized instances
- Instance metadata service v2 (IMDSv2)

### Kubernetes Optimization
- Resource requests and limits defined
- Pod priority and preemption configured
- PodDisruptionBudgets for critical apps
- Topology spread constraints for availability

### Network Performance
- CNI prefix delegation enabled
- Security group per pod (optional)
- Network policies for traffic control

## Troubleshooting Guide

### Common Issues

#### Issue: Nodes not joining cluster
**Symptoms**: Nodes visible in EC2 but not in `kubectl get nodes`

**Resolution**:
```bash
# Check node logs
aws ssm start-session --target $INSTANCE_ID
sudo journalctl -u kubelet -f

# Verify security groups
aws ec2 describe-security-groups --group-ids $SG_ID

# Check IAM role
aws sts assume-role --role-arn $NODE_ROLE_ARN --role-session-name test
```

#### Issue: Pods stuck in Pending
**Symptoms**: Pods not scheduling

**Resolution**:
```bash
# Check pod events
kubectl describe pod $POD_NAME

# Check node resources
kubectl top nodes

# Check taints/tolerations
kubectl get nodes -o json | jq '.items[].spec.taints'

# Trigger autoscaler
kubectl logs -n kube-system -l app=cluster-autoscaler
```

#### Issue: Load balancer not creating
**Symptoms**: Service type LoadBalancer stuck in pending

**Resolution**:
```bash
# Check controller logs
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller

# Verify service account annotations
kubectl describe sa aws-load-balancer-controller -n kube-system

# Check subnet tags
aws ec2 describe-subnets --subnet-ids $SUBNET_ID
```

## Maintenance Schedule

### Daily
- Monitor CloudWatch metrics
- Check cluster health
- Review application logs

### Weekly
- Review and optimize costs
- Check for security updates
- Review scaling events
- Backup verification

### Monthly
- Update node AMIs
- Review and rotate credentials
- Security audit
- Capacity planning review

### Quarterly
- Kubernetes version upgrade
- Update add-ons
- DR testing
- Cost optimization review

## Additional Resources

### AWS Documentation
- [EKS Best Practices](https://aws.github.io/aws-eks-best-practices/)
- [VPC Design](https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html)
- [IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)

### Terraform
- [AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [Terraform Best Practices](https://www.terraform-best-practices.com/)

### Kubernetes
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)

## Support

For issues or questions:
- **Email**: platform-team@example.com
- **Slack**: #llm-analytics-hub
- **GitHub**: https://github.com/your-org/llm-analytics-hub/issues

---

**Document Version**: 1.0
**Last Updated**: 2024-11-20
**Maintained By**: Platform Engineering Team
