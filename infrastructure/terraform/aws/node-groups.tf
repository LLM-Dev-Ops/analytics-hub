# Launch Template for System Node Group
resource "aws_launch_template" "system" {
  name_prefix = "${local.cluster_name}-system-"
  description = "Launch template for system node group"

  vpc_security_group_ids = [aws_security_group.node.id]

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_size           = var.system_node_disk_size
      volume_type           = "gp3"
      iops                  = 3000
      throughput            = 125
      delete_on_termination = true
      encrypted             = true
    }
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "enabled"
  }

  monitoring {
    enabled = true
  }

  tag_specifications {
    resource_type = "instance"
    tags = merge(
      local.common_tags,
      {
        Name      = "${local.cluster_name}-system-node"
        NodeGroup = "system"
      }
    )
  }

  tag_specifications {
    resource_type = "volume"
    tags = merge(
      local.common_tags,
      {
        Name      = "${local.cluster_name}-system-node-volume"
        NodeGroup = "system"
      }
    )
  }

  user_data = base64encode(templatefile("${path.module}/templates/userdata.sh.tpl", {
    cluster_name        = local.cluster_name
    cluster_endpoint    = aws_eks_cluster.this.endpoint
    cluster_ca          = aws_eks_cluster.this.certificate_authority[0].data
    enable_insights     = var.enable_container_insights
  }))

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-system-lt"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# System Node Group
resource "aws_eks_node_group" "system" {
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = "${local.cluster_name}-${var.system_node_group_name}"
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = module.vpc.private_subnets
  version         = var.kubernetes_version

  capacity_type  = var.system_node_capacity_type
  instance_types = var.system_node_instance_types

  scaling_config {
    desired_size = var.system_node_desired_size
    max_size     = var.system_node_max_size
    min_size     = var.system_node_min_size
  }

  update_config {
    max_unavailable_percentage = 33
  }

  launch_template {
    id      = aws_launch_template.system.id
    version = "$Latest"
  }

  labels = {
    role      = "system"
    nodegroup = var.system_node_group_name
  }

  tags = merge(
    local.common_tags,
    {
      Name                                        = "${local.cluster_name}-${var.system_node_group_name}"
      "k8s.io/cluster-autoscaler/${local.cluster_name}" = "owned"
      "k8s.io/cluster-autoscaler/enabled"               = "true"
    }
  )

  depends_on = [
    aws_iam_role_policy_attachment.node_policies
  ]

  lifecycle {
    create_before_destroy = true
    ignore_changes        = [scaling_config[0].desired_size]
  }
}

# Launch Template for Application Node Group
resource "aws_launch_template" "application" {
  name_prefix = "${local.cluster_name}-application-"
  description = "Launch template for application node group"

  vpc_security_group_ids = [aws_security_group.node.id]

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_size           = var.app_node_disk_size
      volume_type           = "gp3"
      iops                  = 3000
      throughput            = 125
      delete_on_termination = true
      encrypted             = true
    }
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "enabled"
  }

  monitoring {
    enabled = true
  }

  tag_specifications {
    resource_type = "instance"
    tags = merge(
      local.common_tags,
      {
        Name      = "${local.cluster_name}-application-node"
        NodeGroup = "application"
      }
    )
  }

  tag_specifications {
    resource_type = "volume"
    tags = merge(
      local.common_tags,
      {
        Name      = "${local.cluster_name}-application-node-volume"
        NodeGroup = "application"
      }
    )
  }

  user_data = base64encode(templatefile("${path.module}/templates/userdata.sh.tpl", {
    cluster_name        = local.cluster_name
    cluster_endpoint    = aws_eks_cluster.this.endpoint
    cluster_ca          = aws_eks_cluster.this.certificate_authority[0].data
    enable_insights     = var.enable_container_insights
  }))

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-application-lt"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# Application Node Group
resource "aws_eks_node_group" "application" {
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = "${local.cluster_name}-${var.app_node_group_name}"
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = module.vpc.private_subnets
  version         = var.kubernetes_version

  capacity_type  = var.app_node_capacity_type
  instance_types = var.app_node_instance_types

  scaling_config {
    desired_size = var.app_node_desired_size
    max_size     = var.app_node_max_size
    min_size     = var.app_node_min_size
  }

  update_config {
    max_unavailable_percentage = 33
  }

  launch_template {
    id      = aws_launch_template.application.id
    version = "$Latest"
  }

  labels = {
    role      = "application"
    nodegroup = var.app_node_group_name
  }

  tags = merge(
    local.common_tags,
    {
      Name                                        = "${local.cluster_name}-${var.app_node_group_name}"
      "k8s.io/cluster-autoscaler/${local.cluster_name}" = "owned"
      "k8s.io/cluster-autoscaler/enabled"               = "true"
    }
  )

  depends_on = [
    aws_iam_role_policy_attachment.node_policies,
    aws_eks_node_group.system
  ]

  lifecycle {
    create_before_destroy = true
    ignore_changes        = [scaling_config[0].desired_size]
  }
}

# Launch Template for Database Node Group
resource "aws_launch_template" "database" {
  name_prefix = "${local.cluster_name}-database-"
  description = "Launch template for database node group"

  vpc_security_group_ids = [aws_security_group.node.id]

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_size           = var.db_node_disk_size
      volume_type           = var.db_node_disk_type
      iops                  = var.db_node_disk_iops
      throughput            = var.db_node_disk_type == "gp3" ? var.db_node_disk_throughput : null
      delete_on_termination = true
      encrypted             = true
    }
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "enabled"
  }

  monitoring {
    enabled = true
  }

  tag_specifications {
    resource_type = "instance"
    tags = merge(
      local.common_tags,
      {
        Name      = "${local.cluster_name}-database-node"
        NodeGroup = "database"
      }
    )
  }

  tag_specifications {
    resource_type = "volume"
    tags = merge(
      local.common_tags,
      {
        Name      = "${local.cluster_name}-database-node-volume"
        NodeGroup = "database"
      }
    )
  }

  user_data = base64encode(templatefile("${path.module}/templates/userdata.sh.tpl", {
    cluster_name        = local.cluster_name
    cluster_endpoint    = aws_eks_cluster.this.endpoint
    cluster_ca          = aws_eks_cluster.this.certificate_authority[0].data
    enable_insights     = var.enable_container_insights
  }))

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-database-lt"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# Database Node Group
resource "aws_eks_node_group" "database" {
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = "${local.cluster_name}-${var.db_node_group_name}"
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = module.vpc.private_subnets
  version         = var.kubernetes_version

  capacity_type  = var.db_node_capacity_type
  instance_types = var.db_node_instance_types

  scaling_config {
    desired_size = var.db_node_desired_size
    max_size     = var.db_node_max_size
    min_size     = var.db_node_min_size
  }

  update_config {
    max_unavailable_percentage = 33
  }

  launch_template {
    id      = aws_launch_template.database.id
    version = "$Latest"
  }

  labels = {
    role      = "database"
    nodegroup = var.db_node_group_name
  }

  # Taints to ensure only database workloads run on these nodes
  taint {
    key    = "workload"
    value  = "database"
    effect = "NO_SCHEDULE"
  }

  tags = merge(
    local.common_tags,
    {
      Name                                        = "${local.cluster_name}-${var.db_node_group_name}"
      "k8s.io/cluster-autoscaler/${local.cluster_name}" = "owned"
      "k8s.io/cluster-autoscaler/enabled"               = "true"
    }
  )

  depends_on = [
    aws_iam_role_policy_attachment.node_policies,
    aws_eks_node_group.system
  ]

  lifecycle {
    create_before_destroy = true
    ignore_changes        = [scaling_config[0].desired_size]
  }
}
