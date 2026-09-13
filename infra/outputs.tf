output "cloudfront_url" {
  description = "FrontendとAPIの単一公開URL"
  value       = "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "alb_direct_url_for_403_check" {
  description = "直接アクセスが403になることだけを確認するURL"
  value       = "http://${aws_lb.api.dns_name}"
}

output "frontend_bucket_name" {
  value = aws_s3_bucket.frontend.id
}

output "ecr_repository_name" {
  value = aws_ecr_repository.backend.name
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  value = aws_ecs_service.backend.name
}

output "ecs_task_family" {
  value = aws_ecs_task_definition.backend.family
}

output "ecs_seed_task_family" {
  value = aws_ecs_task_definition.seed.family
}

output "github_deploy_role_arn" {
  description = "GitHub Environment variable AWS_DEPLOY_ROLE_ARNへ登録する"
  value       = aws_iam_role.github_deploy.arn
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.main.id
}
