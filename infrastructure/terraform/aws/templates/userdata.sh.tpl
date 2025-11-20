#!/bin/bash
set -o xtrace

# Bootstrap the node
/etc/eks/bootstrap.sh ${cluster_name} \
  --b64-cluster-ca ${cluster_ca} \
  --apiserver-endpoint ${cluster_endpoint} \
%{ if enable_insights ~}
  --enable-docker-bridge true \
%{ endif ~}
  --kubelet-extra-args '--node-labels=eks.amazonaws.com/nodegroup-image=$${AMI_ID},eks.amazonaws.com/capacityType=ON_DEMAND'

# Install CloudWatch agent for Container Insights
%{ if enable_insights ~}
curl -O https://raw.githubusercontent.com/aws-samples/amazon-cloudwatch-container-insights/latest/k8s-deployment-manifest-templates/deployment-mode/daemonset/container-insights-monitoring/quickstart/cwagent-fluentd-quickstart.yaml

# Configure CloudWatch agent
cat <<EOF > /etc/cloudwatch-config.json
{
  "agent": {
    "region": "$(ec2-metadata --availability-zone | sed 's/[a-z]$//')"
  },
  "logs": {
    "metrics_collected": {
      "kubernetes": {
        "metrics_collection_interval": 60
      }
    }
  }
}
EOF
%{ endif ~}

# Configure system settings for better performance
cat <<EOF >> /etc/sysctl.conf
# Network performance tuning
net.core.somaxconn = 32768
net.ipv4.tcp_max_syn_backlog = 8192
net.core.netdev_max_backlog = 5000

# Increase file descriptor limits
fs.file-max = 2097152
fs.nr_open = 2097152

# Virtual memory settings
vm.max_map_count = 262144
vm.swappiness = 10
EOF

sysctl -p

# Set file descriptor limits
cat <<EOF >> /etc/security/limits.conf
* soft nofile 1048576
* hard nofile 1048576
* soft nproc 1048576
* hard nproc 1048576
EOF

# Enable kernel modules for container networking
modprobe br_netfilter
modprobe nf_nat
modprobe xt_REDIRECT
modprobe xt_owner
modprobe iptable_nat
modprobe iptable_mangle
modprobe iptable_filter

# Make modules load on boot
cat <<EOF > /etc/modules-load.d/kubernetes.conf
br_netfilter
nf_nat
xt_REDIRECT
xt_owner
iptable_nat
iptable_mangle
iptable_filter
EOF

echo "User data script completed successfully"
