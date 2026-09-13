locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }

  public_subnet_cidrs  = ["10.0.0.0/24", "10.0.1.0/24"]
  private_subnet_cidrs = ["10.0.10.0/24", "10.0.11.0/24"]
  availability_zones   = ["${var.aws_region}a", "${var.aws_region}c"]

  frontend_bucket_name = "${local.name_prefix}-frontend-${data.aws_caller_identity.current.account_id}"
  cloudfront_origin_id = "${local.name_prefix}-frontend"
  alb_origin_id        = "${local.name_prefix}-api"

  github_oidc_provider_arn = var.existing_github_oidc_provider_arn != "" ? var.existing_github_oidc_provider_arn : aws_iam_openid_connect_provider.github[0].arn
}
