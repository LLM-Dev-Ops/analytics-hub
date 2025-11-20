# VPC Module
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${local.cluster_name}-vpc"
  cidr = var.vpc_cidr

  azs             = local.azs
  private_subnets = [for k, v in local.azs : cidrsubnet(var.vpc_cidr, 4, k)]
  public_subnets  = [for k, v in local.azs : cidrsubnet(var.vpc_cidr, 8, k + 48)]
  intra_subnets   = [for k, v in local.azs : cidrsubnet(var.vpc_cidr, 8, k + 52)]

  enable_nat_gateway   = var.enable_nat_gateway
  single_nat_gateway   = var.single_nat_gateway
  enable_dns_hostnames = var.enable_dns_hostnames
  enable_dns_support   = var.enable_dns_support
  enable_vpn_gateway   = var.enable_vpn_gateway

  # VPC Flow Logs
  enable_flow_log                      = var.enable_vpc_flow_logs
  create_flow_log_cloudwatch_iam_role  = var.enable_vpc_flow_logs
  create_flow_log_cloudwatch_log_group = var.enable_vpc_flow_logs
  flow_log_retention_in_days           = var.vpc_flow_logs_retention_days

  # Kubernetes tags for subnet auto-discovery
  public_subnet_tags = {
    "kubernetes.io/role/elb"                    = "1"
    "kubernetes.io/cluster/${local.cluster_name}" = "shared"
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb"           = "1"
    "kubernetes.io/cluster/${local.cluster_name}" = "shared"
  }

  tags = merge(
    local.common_tags,
    var.tags,
    {
      Name = "${local.cluster_name}-vpc"
    }
  )
}

# VPC Endpoints for AWS Services
locals {
  vpc_endpoints_config = {
    s3 = {
      service         = "s3"
      service_type    = "Gateway"
      route_table_ids = flatten([module.vpc.private_route_table_ids, module.vpc.public_route_table_ids])
      tags = {
        Name = "${local.cluster_name}-s3-endpoint"
      }
    }
    ec2 = {
      service             = "ec2"
      service_type        = "Interface"
      subnet_ids          = module.vpc.private_subnets
      security_group_ids  = [aws_security_group.vpc_endpoints.id]
      private_dns_enabled = true
      tags = {
        Name = "${local.cluster_name}-ec2-endpoint"
      }
    }
    ecr_api = {
      service             = "ecr.api"
      service_type        = "Interface"
      subnet_ids          = module.vpc.private_subnets
      security_group_ids  = [aws_security_group.vpc_endpoints.id]
      private_dns_enabled = true
      tags = {
        Name = "${local.cluster_name}-ecr-api-endpoint"
      }
    }
    ecr_dkr = {
      service             = "ecr.dkr"
      service_type        = "Interface"
      subnet_ids          = module.vpc.private_subnets
      security_group_ids  = [aws_security_group.vpc_endpoints.id]
      private_dns_enabled = true
      tags = {
        Name = "${local.cluster_name}-ecr-dkr-endpoint"
      }
    }
    logs = {
      service             = "logs"
      service_type        = "Interface"
      subnet_ids          = module.vpc.private_subnets
      security_group_ids  = [aws_security_group.vpc_endpoints.id]
      private_dns_enabled = true
      tags = {
        Name = "${local.cluster_name}-logs-endpoint"
      }
    }
    sts = {
      service             = "sts"
      service_type        = "Interface"
      subnet_ids          = module.vpc.private_subnets
      security_group_ids  = [aws_security_group.vpc_endpoints.id]
      private_dns_enabled = true
      tags = {
        Name = "${local.cluster_name}-sts-endpoint"
      }
    }
    elasticloadbalancing = {
      service             = "elasticloadbalancing"
      service_type        = "Interface"
      subnet_ids          = module.vpc.private_subnets
      security_group_ids  = [aws_security_group.vpc_endpoints.id]
      private_dns_enabled = true
      tags = {
        Name = "${local.cluster_name}-elb-endpoint"
      }
    }
    autoscaling = {
      service             = "autoscaling"
      service_type        = "Interface"
      subnet_ids          = module.vpc.private_subnets
      security_group_ids  = [aws_security_group.vpc_endpoints.id]
      private_dns_enabled = true
      tags = {
        Name = "${local.cluster_name}-autoscaling-endpoint"
      }
    }
  }
}

# Create VPC Endpoints
resource "aws_vpc_endpoint" "this" {
  for_each = var.enable_vpc_endpoints ? {
    for k, v in local.vpc_endpoints_config : k => v
    if contains(var.vpc_endpoints, replace(k, "_", "."))
  } : {}

  vpc_id            = module.vpc.vpc_id
  service_name      = "com.amazonaws.${var.aws_region}.${each.value.service}"
  vpc_endpoint_type = each.value.service_type

  # Gateway endpoints
  route_table_ids = lookup(each.value, "route_table_ids", null)

  # Interface endpoints
  subnet_ids          = lookup(each.value, "subnet_ids", null)
  security_group_ids  = lookup(each.value, "security_group_ids", null)
  private_dns_enabled = lookup(each.value, "private_dns_enabled", null)

  tags = merge(
    local.common_tags,
    lookup(each.value, "tags", {}),
    {
      Service = each.value.service
    }
  )
}

# Security Group for VPC Endpoints
resource "aws_security_group" "vpc_endpoints" {
  name_prefix = "${local.cluster_name}-vpc-endpoints-"
  description = "Security group for VPC endpoints"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "HTTPS from VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-vpc-endpoints-sg"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# CloudWatch Log Group for VPC Flow Logs (if not created by module)
resource "aws_cloudwatch_log_group" "vpc_flow_logs" {
  count = var.enable_vpc_flow_logs && !module.vpc.create_flow_log_cloudwatch_log_group ? 1 : 0

  name              = "/aws/vpc/${local.cluster_name}"
  retention_in_days = var.vpc_flow_logs_retention_days

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-vpc-flow-logs"
    }
  )
}
