variable "aws_region" {
  description = "検証環境を作るAWS Region"
  type        = string
  default     = "ap-northeast-1"

  validation {
    condition     = var.aws_region == "ap-northeast-1"
    error_message = "同梱RDS CAと検証済みAZを使うため、aws_regionはap-northeast-1に固定します。"
  }
}

variable "project_name" {
  description = "resource名とtagに使うproject名"
  type        = string
  default     = "fieldflow"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,20}$", var.project_name))
    error_message = "project_nameは英小文字・数字・hyphenの3〜21文字で指定してください。"
  }
}

variable "environment" {
  description = "AWS検証環境名"
  type        = string
  default     = "validation"
}

variable "vpc_cidr" {
  description = "FieldFlow専用VPCのCIDR"
  type        = string
  default     = "10.0.0.0/16"
}

variable "db_engine_version" {
  description = "ap-northeast-1で確認済みのRDS MySQL 8.4 patch"
  type        = string
  default     = "8.4.11"
}

variable "db_instance_class" {
  description = "学習用Single-AZ RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_name" {
  description = "FieldFlow database名"
  type        = string
  default     = "fieldflow"
}

variable "db_username" {
  description = "RDS master username。passwordはRDS管理Secrets Managerで生成する"
  type        = string
  default     = "fieldflow_admin"
}

variable "initial_admin_name" {
  description = "初回Seedで作る管理者の表示名"
  type        = string
  default     = "FieldFlow管理者"
}

variable "initial_admin_login_id" {
  description = "初回Seedで作る管理者login ID"
  type        = string
  default     = "admin"

  validation {
    condition     = can(regex("^[a-z0-9._-]{4,50}$", var.initial_admin_login_id))
    error_message = "initial_admin_login_idは英小文字・数字・._-の4〜50文字で指定してください。"
  }
}

variable "backend_cpu" {
  description = "Fargate Task CPU unit"
  type        = number
  default     = 256
}

variable "backend_memory" {
  description = "Fargate Task memory MiB"
  type        = number
  default     = 512
}

variable "log_retention_days" {
  description = "Backend CloudWatch Logs保持日数"
  type        = number
  default     = 30
}

variable "github_repository" {
  description = "OIDCを許可するowner/repository"
  type        = string
  default     = "Hiroyuki-12/FieldFlow"
}

variable "github_environment" {
  description = "GitHub側で承認ruleを設定するEnvironment名"
  type        = string
  default     = "aws-validation"
}

variable "existing_github_oidc_provider_arn" {
  description = "AccountにGitHub OIDC providerが既にある場合のARN。空なら作成する"
  type        = string
  default     = ""
}

variable "enable_container_insights" {
  description = "追加metrics課金を理解した上でECS Container Insightsを有効化する"
  type        = bool
  default     = false
}

variable "deletion_protection" {
  description = "検証中の誤削除を防ぐ。計画的destroyの直前だけfalseへ変更する"
  type        = bool
  default     = false
}
