resource "random_password" "jwt_access_secret" {
  length  = 64
  special = false
}

resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "random_password" "origin_verify" {
  length  = 64
  special = false
}

resource "random_password" "initial_admin" {
  length  = 24
  special = false
}

resource "aws_ssm_parameter" "jwt_access_secret" {
  name        = "/${local.name_prefix}/backend/jwt-access-secret"
  description = "JWT access token signing secret for FieldFlow AWS validation"
  type        = "SecureString"
  value       = random_password.jwt_access_secret.result
}

resource "aws_ssm_parameter" "db_password" {
  name        = "/${local.name_prefix}/backend/db-password"
  description = "RDS master password injected only into FieldFlow ECS tasks"
  type        = "SecureString"
  value       = random_password.db_password.result
}

resource "aws_ssm_parameter" "origin_verify" {
  name        = "/${local.name_prefix}/backend/origin-verify-secret"
  description = "CloudFront to ALB and NestJS origin verification secret"
  type        = "SecureString"
  value       = random_password.origin_verify.result
}

resource "aws_ssm_parameter" "initial_admin_password" {
  name        = "/${local.name_prefix}/seed/initial-admin-password"
  description = "One-time initial admin password; the user must change it at first login"
  type        = "SecureString"
  value       = random_password.initial_admin.result
}
