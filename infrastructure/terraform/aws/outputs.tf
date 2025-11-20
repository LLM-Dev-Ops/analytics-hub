# VPC Outputs
output "vpc_id" {
  description = "The ID of the VPC"
  value       = module.vpc.vpc_id
}

output "vpc_cidr_block" {
  description = "The CIDR block of the VPC"
  value       = module.vpc.vpc_cidr_block
}

output "private_subnets" {
  description = "List of IDs of private subnets"
  value       = module.vpc.private_subnets
}

output "public_subnets" {
  description = "List of IDs of public subnets"
  value       = module.vpc.public_subnets
}

output "nat_gateway_ids" {
  description = "List of NAT Gateway IDs"
  value       = module.vpc.natgw_ids
}

output "azs" {
  description = "List of availability zones used"
  value       = local.azs
}

# EKS Cluster Outputs
output "cluster_id" {
  description = "The name/id of the EKS cluster"
  value       = aws_eks_cluster.this.id
}

output "cluster_arn" {
  description = "The Amazon Resource Name (ARN) of the cluster"
  value       = aws_eks_cluster.this.arn
}

output "cluster_endpoint" {
  description = "Endpoint for your Kubernetes API server"
  value       = aws_eks_cluster.this.endpoint
}

output "cluster_version" {
  description = "The Kubernetes server version for the cluster"
  value       = aws_eks_cluster.this.version
}

output "cluster_platform_version" {
  description = "The platform version for the cluster"
  value       = aws_eks_cluster.this.platform_version
}

output "cluster_certificate_authority_data" {
  description = "Base64 encoded certificate data required to communicate with the cluster"
  value       = aws_eks_cluster.this.certificate_authority[0].data
  sensitive   = true
}

output "cluster_security_group_id" {
  description = "Security group ID attached to the EKS cluster"
  value       = aws_security_group.cluster.id
}

output "cluster_iam_role_arn" {
  description = "IAM role ARN of the EKS cluster"
  value       = aws_iam_role.cluster.arn
}

output "cluster_oidc_issuer_url" {
  description = "The URL on the EKS cluster OIDC Issuer"
  value       = try(aws_eks_cluster.this.identity[0].oidc[0].issuer, null)
}

output "oidc_provider_arn" {
  description = "ARN of the OIDC Provider for EKS"
  value       = try(aws_iam_openid_connect_provider.this[0].arn, null)
}

# Node Group Outputs
output "node_security_group_id" {
  description = "Security group ID attached to the EKS nodes"
  value       = aws_security_group.node.id
}

output "node_iam_role_arn" {
  description = "IAM role ARN of the EKS nodes"
  value       = aws_iam_role.node.arn
}

output "system_node_group_id" {
  description = "EKS system node group ID"
  value       = aws_eks_node_group.system.id
}

output "system_node_group_arn" {
  description = "Amazon Resource Name (ARN) of the system node group"
  value       = aws_eks_node_group.system.arn
}

output "system_node_group_status" {
  description = "Status of the system node group"
  value       = aws_eks_node_group.system.status
}

output "application_node_group_id" {
  description = "EKS application node group ID"
  value       = aws_eks_node_group.application.id
}

output "application_node_group_arn" {
  description = "Amazon Resource Name (ARN) of the application node group"
  value       = aws_eks_node_group.application.arn
}

output "application_node_group_status" {
  description = "Status of the application node group"
  value       = aws_eks_node_group.application.status
}

output "database_node_group_id" {
  description = "EKS database node group ID"
  value       = aws_eks_node_group.database.id
}

output "database_node_group_arn" {
  description = "Amazon Resource Name (ARN) of the database node group"
  value       = aws_eks_node_group.database.arn
}

output "database_node_group_status" {
  description = "Status of the database node group"
  value       = aws_eks_node_group.database.status
}

# IAM Role Outputs for IRSA
output "ebs_csi_driver_role_arn" {
  description = "IAM role ARN for EBS CSI driver"
  value       = try(aws_iam_role.ebs_csi_driver[0].arn, null)
}

output "cluster_autoscaler_role_arn" {
  description = "IAM role ARN for cluster autoscaler"
  value       = try(aws_iam_role.cluster_autoscaler[0].arn, null)
}

output "aws_load_balancer_controller_role_arn" {
  description = "IAM role ARN for AWS Load Balancer Controller"
  value       = try(aws_iam_role.aws_load_balancer_controller[0].arn, null)
}

# Security Group Outputs
output "database_security_group_id" {
  description = "Security group ID for database access"
  value       = aws_security_group.database.id
}

output "alb_security_group_id" {
  description = "Security group ID for Application Load Balancer"
  value       = aws_security_group.alb.id
}

# CloudWatch Outputs
output "cluster_cloudwatch_log_group_name" {
  description = "Name of the CloudWatch log group for cluster logs"
  value       = aws_cloudwatch_log_group.eks_cluster.name
}

output "cluster_cloudwatch_log_group_arn" {
  description = "ARN of the CloudWatch log group for cluster logs"
  value       = aws_cloudwatch_log_group.eks_cluster.arn
}

# KMS Outputs
output "kms_key_id" {
  description = "The globally unique identifier for the KMS key"
  value       = try(aws_kms_key.eks[0].key_id, null)
}

output "kms_key_arn" {
  description = "The Amazon Resource Name (ARN) of the KMS key"
  value       = try(aws_kms_key.eks[0].arn, null)
}

# Configuration Outputs
output "region" {
  description = "AWS region"
  value       = var.aws_region
}

output "environment" {
  description = "Environment name"
  value       = var.environment
}

output "cluster_name" {
  description = "Kubernetes Cluster Name"
  value       = local.cluster_name
}

# kubectl Configuration Command
output "configure_kubectl" {
  description = "Configure kubectl: run the following command to update your kubeconfig"
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${aws_eks_cluster.this.name}"
}

# Cluster Access Test Command
output "test_cluster_access" {
  description = "Test cluster access with kubectl"
  value       = "kubectl get nodes"
}

# VPC Endpoints
output "vpc_endpoints" {
  description = "Map of VPC endpoints created"
  value = {
    for k, v in aws_vpc_endpoint.this : k => {
      id           = v.id
      arn          = v.arn
      service_name = v.service_name
      state        = v.state
    }
  }
}
