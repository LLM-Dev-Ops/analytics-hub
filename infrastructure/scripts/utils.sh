#!/bin/bash

################################################################################
# LLM Analytics Hub - Utility Functions
#
# Shared utility functions for deployment scripts
################################################################################

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

# Check if command exists
command_exists() {
    command -v "$1" &> /dev/null
}

# Generate secure random password
generate_password() {
    local length="${1:-16}"
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-${length}
}

# Wait for resource with timeout
wait_for_resource() {
    local resource_type="$1"
    local resource_name="$2"
    local namespace="${3:-default}"
    local timeout="${4:-300}"

    log_info "Waiting for ${resource_type}/${resource_name} to be ready..."

    kubectl wait --for=condition=ready "${resource_type}/${resource_name}" \
        -n "${namespace}" \
        --timeout="${timeout}s" 2>/dev/null

    return $?
}

# Check Kubernetes connectivity
check_k8s_connection() {
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        return 1
    fi
    return 0
}

# Get cloud provider from context
detect_cloud_provider() {
    local context=$(kubectl config current-context 2>/dev/null || echo "")

    if [[ "${context}" == *"eks"* ]] || [[ "${context}" == *"aws"* ]]; then
        echo "aws"
    elif [[ "${context}" == *"gke"* ]] || [[ "${context}" == *"gcp"* ]]; then
        echo "gcp"
    elif [[ "${context}" == *"aks"* ]] || [[ "${context}" == *"azure"* ]]; then
        echo "azure"
    else
        echo "unknown"
    fi
}

# Retry function with exponential backoff
retry_with_backoff() {
    local max_attempts="${1:-5}"
    local delay="${2:-1}"
    local max_delay="${3:-60}"
    shift 3
    local attempt=1

    while [ ${attempt} -le ${max_attempts} ]; do
        if "$@"; then
            return 0
        fi

        if [ ${attempt} -eq ${max_attempts} ]; then
            log_error "Command failed after ${max_attempts} attempts: $*"
            return 1
        fi

        log_warn "Attempt ${attempt}/${max_attempts} failed. Retrying in ${delay}s..."
        sleep ${delay}

        delay=$((delay * 2))
        if [ ${delay} -gt ${max_delay} ]; then
            delay=${max_delay}
        fi

        attempt=$((attempt + 1))
    done
}

# Load YAML configuration
load_config() {
    local config_file="$1"
    local key="$2"

    if [ ! -f "${config_file}" ]; then
        log_error "Config file not found: ${config_file}"
        return 1
    fi

    if command_exists yq; then
        yq eval ".${key}" "${config_file}"
    else
        log_error "yq not installed. Cannot parse YAML config."
        return 1
    fi
}

# Save JSON data
save_json() {
    local file="$1"
    local data="$2"

    echo "${data}" | jq '.' > "${file}" 2>/dev/null
    if [ $? -eq 0 ]; then
        log_success "Saved JSON to: ${file}"
    else
        log_error "Failed to save JSON to: ${file}"
        return 1
    fi
}

# Get secret from Kubernetes
get_k8s_secret() {
    local secret_name="$1"
    local key="$2"
    local namespace="${3:-default}"

    kubectl get secret "${secret_name}" -n "${namespace}" \
        -o jsonpath="{.data.${key}}" 2>/dev/null | base64 -d
}

# Create Kubernetes secret
create_k8s_secret() {
    local secret_name="$1"
    local namespace="$2"
    shift 2
    local key_values=("$@")

    local secret_args=""
    for kv in "${key_values[@]}"; do
        secret_args="${secret_args} --from-literal=${kv}"
    done

    kubectl create secret generic "${secret_name}" \
        -n "${namespace}" \
        ${secret_args} \
        --dry-run=client -o yaml | kubectl apply -f -
}

# Check port availability
check_port() {
    local port="$1"
    if nc -z localhost "${port}" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Get available port
get_available_port() {
    local start_port="${1:-8000}"
    local end_port="${2:-9000}"

    for port in $(seq ${start_port} ${end_port}); do
        if ! check_port ${port}; then
            echo ${port}
            return 0
        fi
    done

    log_error "No available ports in range ${start_port}-${end_port}"
    return 1
}

# Validate environment name
validate_environment() {
    local env="$1"

    case "${env}" in
        dev|development|staging|stage|prod|production)
            return 0
            ;;
        *)
            log_error "Invalid environment: ${env}"
            log_error "Valid environments: dev, staging, production"
            return 1
            ;;
    esac
}

# Get timestamp
get_timestamp() {
    date -u +%Y-%m-%dT%H:%M:%SZ
}

# Calculate duration
calculate_duration() {
    local start_time="$1"
    local end_time="$2"

    local duration=$((end_time - start_time))
    local hours=$((duration / 3600))
    local minutes=$(((duration % 3600) / 60))
    local seconds=$((duration % 60))

    printf "%02d:%02d:%02d" ${hours} ${minutes} ${seconds}
}

# Check disk space
check_disk_space() {
    local required_gb="${1:-10}"
    local available_gb=$(df -BG . | awk 'NR==2 {gsub(/G/,"",$4); print $4}')

    if [ ${available_gb} -lt ${required_gb} ]; then
        log_warn "Low disk space: ${available_gb}GB available, ${required_gb}GB required"
        return 1
    fi
    return 0
}

# Check memory
check_memory() {
    local required_gb="${1:-8}"
    local available_gb=$(free -g | awk 'NR==2 {print $7}')

    if [ ${available_gb} -lt ${required_gb} ]; then
        log_warn "Low memory: ${available_gb}GB available, ${required_gb}GB required"
        return 1
    fi
    return 0
}

# Parse semantic version
parse_version() {
    local version="$1"
    echo "${version}" | sed 's/v//' | cut -d. -f1-3
}

# Compare versions
version_gte() {
    local version1="$1"
    local version2="$2"

    version1=$(parse_version "${version1}")
    version2=$(parse_version "${version2}")

    if [ "$(printf '%s\n' "$version1" "$version2" | sort -V | head -n1)" = "$version2" ]; then
        return 0
    else
        return 1
    fi
}

# Get kubectl version
get_kubectl_version() {
    kubectl version --client --short 2>/dev/null | grep -oP 'v\d+\.\d+\.\d+' || echo "unknown"
}

# Get helm version
get_helm_version() {
    helm version --short 2>/dev/null | grep -oP 'v\d+\.\d+\.\d+' || echo "unknown"
}

# Create backup
create_backup() {
    local source="$1"
    local backup_dir="${2:-./backups}"
    local timestamp=$(date +%Y%m%d-%H%M%S)

    mkdir -p "${backup_dir}"

    if [ -d "${source}" ]; then
        tar czf "${backup_dir}/$(basename ${source})-${timestamp}.tar.gz" -C "$(dirname ${source})" "$(basename ${source})"
    elif [ -f "${source}" ]; then
        cp "${source}" "${backup_dir}/$(basename ${source})-${timestamp}"
    else
        log_error "Source not found: ${source}"
        return 1
    fi

    log_success "Backup created in ${backup_dir}"
}

# Cleanup old backups
cleanup_old_backups() {
    local backup_dir="$1"
    local keep_days="${2:-7}"

    find "${backup_dir}" -type f -mtime +${keep_days} -delete
    log_info "Cleaned up backups older than ${keep_days} days"
}

# Send notification (placeholder for actual implementation)
send_notification() {
    local message="$1"
    local severity="${2:-info}"

    # Placeholder - integrate with Slack, PagerDuty, etc.
    log_info "Notification (${severity}): ${message}"
}

# Export functions for use in other scripts
export -f log_info log_success log_warn log_error
export -f command_exists generate_password wait_for_resource
export -f check_k8s_connection detect_cloud_provider retry_with_backoff
export -f load_config save_json get_k8s_secret create_k8s_secret
export -f check_port get_available_port validate_environment
export -f get_timestamp calculate_duration check_disk_space check_memory
export -f parse_version version_gte get_kubectl_version get_helm_version
export -f create_backup cleanup_old_backups send_notification
