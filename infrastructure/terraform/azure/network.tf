# Virtual Network
resource "azurerm_virtual_network" "main" {
  name                = "${var.resource_prefix}-${var.environment}-vnet"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  address_space       = [var.vnet_address_space]

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "Network"
    }
  )
}

# AKS Subnet
resource "azurerm_subnet" "aks" {
  name                 = "${var.resource_prefix}-${var.environment}-aks-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.aks_subnet_address_prefix]

  # Service endpoints for enhanced security
  service_endpoints = [
    "Microsoft.ContainerRegistry",
    "Microsoft.KeyVault",
    "Microsoft.Sql",
    "Microsoft.Storage"
  ]
}

# Database Subnet (for Azure Database services)
resource "azurerm_subnet" "database" {
  name                 = "${var.resource_prefix}-${var.environment}-db-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.database_subnet_address_prefix]

  service_endpoints = [
    "Microsoft.Sql",
    "Microsoft.Storage"
  ]

  delegation {
    name = "postgres-delegation"

    service_delegation {
      name = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = [
        "Microsoft.Network/virtualNetworks/subnets/join/action",
      ]
    }
  }
}

# Application Gateway Subnet (optional, for ingress)
resource "azurerm_subnet" "appgw" {
  count = var.enable_application_gateway ? 1 : 0

  name                 = "${var.resource_prefix}-${var.environment}-appgw-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.appgw_subnet_address_prefix]
}

# Private Endpoint Subnet
resource "azurerm_subnet" "private_endpoints" {
  name                 = "${var.resource_prefix}-${var.environment}-pe-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.private_endpoint_subnet_address_prefix]

  private_endpoint_network_policies_enabled = false
}

# NAT Gateway for AKS egress
resource "azurerm_public_ip" "nat" {
  count = var.enable_nat_gateway ? 1 : 0

  name                = "${var.resource_prefix}-${var.environment}-nat-pip"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  allocation_method   = "Static"
  sku                 = "Standard"
  zones               = var.availability_zones

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "Network"
    }
  )
}

resource "azurerm_nat_gateway" "main" {
  count = var.enable_nat_gateway ? 1 : 0

  name                    = "${var.resource_prefix}-${var.environment}-nat-gw"
  location                = azurerm_resource_group.main.location
  resource_group_name     = azurerm_resource_group.main.name
  sku_name                = "Standard"
  idle_timeout_in_minutes = 10
  zones                   = var.availability_zones

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "Network"
    }
  )
}

resource "azurerm_nat_gateway_public_ip_association" "main" {
  count = var.enable_nat_gateway ? 1 : 0

  nat_gateway_id       = azurerm_nat_gateway.main[0].id
  public_ip_address_id = azurerm_public_ip.nat[0].id
}

resource "azurerm_subnet_nat_gateway_association" "aks" {
  count = var.enable_nat_gateway ? 1 : 0

  subnet_id      = azurerm_subnet.aks.id
  nat_gateway_id = azurerm_nat_gateway.main[0].id
}

# Network Security Groups
resource "azurerm_network_security_group" "aks" {
  name                = "${var.resource_prefix}-${var.environment}-aks-nsg"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "Security"
    }
  )
}

# AKS NSG Rules
resource "azurerm_network_security_rule" "aks_allow_apiserver" {
  name                        = "AllowAPIServer"
  priority                    = 100
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_port_range           = "*"
  destination_port_range      = "443"
  source_address_prefix       = var.allowed_cidr_blocks[0]
  destination_address_prefix  = "*"
  resource_group_name         = azurerm_resource_group.main.name
  network_security_group_name = azurerm_network_security_group.aks.name
}

resource "azurerm_network_security_rule" "aks_deny_all_inbound" {
  name                        = "DenyAllInbound"
  priority                    = 4096
  direction                   = "Inbound"
  access                      = "Deny"
  protocol                    = "*"
  source_port_range           = "*"
  destination_port_range      = "*"
  source_address_prefix       = "*"
  destination_address_prefix  = "*"
  resource_group_name         = azurerm_resource_group.main.name
  network_security_group_name = azurerm_network_security_group.aks.name
}

# Database NSG
resource "azurerm_network_security_group" "database" {
  name                = "${var.resource_prefix}-${var.environment}-db-nsg"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "Security"
    }
  )
}

resource "azurerm_network_security_rule" "db_allow_aks" {
  name                        = "AllowAKS"
  priority                    = 100
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_port_range           = "*"
  destination_port_ranges     = ["5432", "6379", "8086"]
  source_address_prefix       = var.aks_subnet_address_prefix
  destination_address_prefix  = "*"
  resource_group_name         = azurerm_resource_group.main.name
  network_security_group_name = azurerm_network_security_group.database.name
}

resource "azurerm_network_security_rule" "db_deny_all_inbound" {
  name                        = "DenyAllInbound"
  priority                    = 4096
  direction                   = "Inbound"
  access                      = "Deny"
  protocol                    = "*"
  source_port_range           = "*"
  destination_port_range      = "*"
  source_address_prefix       = "*"
  destination_address_prefix  = "*"
  resource_group_name         = azurerm_resource_group.main.name
  network_security_group_name = azurerm_network_security_group.database.name
}

# Associate NSGs with Subnets
resource "azurerm_subnet_network_security_group_association" "aks" {
  subnet_id                 = azurerm_subnet.aks.id
  network_security_group_id = azurerm_network_security_group.aks.id
}

resource "azurerm_subnet_network_security_group_association" "database" {
  subnet_id                 = azurerm_subnet.database.id
  network_security_group_id = azurerm_network_security_group.database.id
}

# Private DNS Zone for AKS (if private cluster enabled)
resource "azurerm_private_dns_zone" "aks" {
  count = var.enable_private_cluster ? 1 : 0

  name                = "privatelink.${var.location}.azmk8s.io"
  resource_group_name = azurerm_resource_group.main.name

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "Network"
    }
  )
}

resource "azurerm_private_dns_zone_virtual_network_link" "aks" {
  count = var.enable_private_cluster ? 1 : 0

  name                  = "${var.resource_prefix}-${var.environment}-aks-dns-link"
  resource_group_name   = azurerm_resource_group.main.name
  private_dns_zone_name = azurerm_private_dns_zone.aks[0].name
  virtual_network_id    = azurerm_virtual_network.main.id

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "Network"
    }
  )
}

# Private Endpoint for ACR
resource "azurerm_private_endpoint" "acr" {
  count = var.acr_enable_private_endpoint ? 1 : 0

  name                = "${var.resource_prefix}-${var.environment}-acr-pe"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  subnet_id           = azurerm_subnet.private_endpoints.id

  private_service_connection {
    name                           = "${var.resource_prefix}-${var.environment}-acr-psc"
    private_connection_resource_id = azurerm_container_registry.main.id
    is_manual_connection           = false
    subresource_names              = ["registry"]
  }

  private_dns_zone_group {
    name                 = "acr-dns-zone-group"
    private_dns_zone_ids = [azurerm_private_dns_zone.acr[0].id]
  }

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "Network"
    }
  )
}

resource "azurerm_private_dns_zone" "acr" {
  count = var.acr_enable_private_endpoint ? 1 : 0

  name                = "privatelink.azurecr.io"
  resource_group_name = azurerm_resource_group.main.name

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "Network"
    }
  )
}

resource "azurerm_private_dns_zone_virtual_network_link" "acr" {
  count = var.acr_enable_private_endpoint ? 1 : 0

  name                  = "${var.resource_prefix}-${var.environment}-acr-dns-link"
  resource_group_name   = azurerm_resource_group.main.name
  private_dns_zone_name = azurerm_private_dns_zone.acr[0].name
  virtual_network_id    = azurerm_virtual_network.main.id

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "Network"
    }
  )
}

# Route Table for custom routing (optional)
resource "azurerm_route_table" "aks" {
  count = var.enable_custom_route_table ? 1 : 0

  name                          = "${var.resource_prefix}-${var.environment}-aks-rt"
  location                      = azurerm_resource_group.main.location
  resource_group_name           = azurerm_resource_group.main.name
  disable_bgp_route_propagation = false

  tags = merge(
    var.common_tags,
    {
      Environment = var.environment
      Component   = "Network"
    }
  )
}

resource "azurerm_subnet_route_table_association" "aks" {
  count = var.enable_custom_route_table ? 1 : 0

  subnet_id      = azurerm_subnet.aks.id
  route_table_id = azurerm_route_table.aks[0].id
}
