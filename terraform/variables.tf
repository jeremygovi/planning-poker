variable "aws_region" {
  description = "AWS region in which to deploy Poker Express."
  type        = string
  default     = "eu-west-3"
}

variable "name" {
  description = "Name prefix applied to AWS resources."
  type        = string
  default     = "poker-express"
}

variable "instance_type" {
  description = "EC2 instance type. Check your account's Free Tier or credit eligibility."
  type        = string
  default     = "t3.micro"
}

variable "docker_image" {
  description = "Published Docker image, including its tag. Pin a release tag in production."
  type        = string
  default     = "jeremygovi/planning-poker:latest"

  validation {
    condition     = can(regex("^[A-Za-z0-9._/:@-]+$", var.docker_image))
    error_message = "docker_image must be a valid image reference without whitespace."
  }
}

variable "app_port" {
  description = "Public TCP port mapped to the application."
  type        = number
  default     = 80

  validation {
    condition     = var.app_port >= 1 && var.app_port <= 65535
    error_message = "app_port must be between 1 and 65535."
  }
}

variable "allowed_cidrs" {
  description = "IPv4 CIDRs allowed to reach the application. Use company/VPN CIDRs, not 0.0.0.0/0, unless an access proxy protects it."
  type        = list(string)

  validation {
    condition     = length(var.allowed_cidrs) > 0 && alltrue([for cidr in var.allowed_cidrs : can(cidrnetmask(cidr))])
    error_message = "Provide at least one valid IPv4 CIDR."
  }
}

variable "public_origin" {
  description = "Exact external HTTP(S) origin used by browsers, without a trailing slash. Empty disables the fixed-origin check."
  type        = string
  default     = ""

  validation {
    condition     = var.public_origin == "" || can(regex("^https?://[^/]+$", var.public_origin))
    error_message = "public_origin must be empty or an HTTP(S) origin without a path or trailing slash."
  }
}

variable "root_volume_size" {
  description = "Encrypted gp3 root volume size in GiB. Application data lives on this volume under /opt/poker-express/data."
  type        = number
  default     = 8

  validation {
    condition     = var.root_volume_size >= 8
    error_message = "root_volume_size must be at least 8 GiB."
  }
}
