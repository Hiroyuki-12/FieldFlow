resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${local.name_prefix}/backend"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_cluster" "main" {
  name = local.name_prefix

  setting {
    name  = "containerInsights"
    value = var.enable_container_insights ? "enabled" : "disabled"
  }
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "${local.name_prefix}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.backend_cpu
  memory                   = var.backend_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "backend"
    image     = "${aws_ecr_repository.backend.repository_url}:bootstrap"
    essential = true

    portMappings = [{
      name          = "http"
      containerPort = 8080
      hostPort      = 8080
      protocol      = "tcp"
    }]

    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "LOG_LEVEL", value = "info" },
      { name = "PORT", value = "8080" },
      { name = "CORS_ORIGIN", value = "https://${aws_cloudfront_distribution.main.domain_name}" },
      { name = "TRUST_PROXY_HOPS", value = "2" },
      { name = "DB_HOST", value = aws_db_instance.main.address },
      { name = "DB_PORT", value = tostring(aws_db_instance.main.port) },
      { name = "DB_NAME", value = var.db_name },
      { name = "DB_USER", value = var.db_username },
      { name = "DB_POOL_LIMIT", value = "5" },
      { name = "DB_CONNECT_TIMEOUT_MS", value = "10000" },
      { name = "DB_TLS_ENABLED", value = "true" },
      { name = "DB_TLS_CA_FILE", value = "/app/certs/ap-northeast-1-bundle.pem" },
      { name = "JWT_ACCESS_TTL_SECONDS", value = "900" },
      { name = "REFRESH_TOKEN_TTL_SECONDS", value = "604800" },
      { name = "COOKIE_SECURE", value = "true" },
    ]

    secrets = [
      {
        name      = "DB_PASSWORD"
        valueFrom = aws_ssm_parameter.db_password.arn
      },
      {
        name      = "JWT_ACCESS_SECRET"
        valueFrom = aws_ssm_parameter.jwt_access_secret.arn
      },
      {
        name      = "INGRESS_PROXY_SECRET"
        valueFrom = aws_ssm_parameter.origin_verify.arn
      },
    ]

    healthCheck = {
      command     = ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 20
    }

    readonlyRootFilesystem = true

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.backend.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "backend"
      }
    }
  }])
}

# 初期passwordを通常Serviceへ渡さないため、冪等Seedだけを実行するTask Definitionを分離する。
resource "aws_ecs_task_definition" "seed" {
  family                   = "${local.name_prefix}-seed"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.backend_cpu
  memory                   = var.backend_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "backend"
    image     = "${aws_ecr_repository.backend.repository_url}:bootstrap"
    essential = true
    command   = ["node", "dist/database/seeds/seed.cli.js"]

    environment = [
      { name = "DB_HOST", value = aws_db_instance.main.address },
      { name = "DB_PORT", value = tostring(aws_db_instance.main.port) },
      { name = "DB_NAME", value = var.db_name },
      { name = "DB_USER", value = var.db_username },
      { name = "DB_POOL_LIMIT", value = "5" },
      { name = "DB_CONNECT_TIMEOUT_MS", value = "10000" },
      { name = "DB_TLS_ENABLED", value = "true" },
      { name = "DB_TLS_CA_FILE", value = "/app/certs/ap-northeast-1-bundle.pem" },
      { name = "INITIAL_ADMIN_NAME", value = var.initial_admin_name },
      { name = "INITIAL_ADMIN_LOGIN_ID", value = var.initial_admin_login_id },
    ]

    secrets = [
      {
        name      = "DB_PASSWORD"
        valueFrom = aws_ssm_parameter.db_password.arn
      },
      {
        name      = "INITIAL_ADMIN_PASSWORD"
        valueFrom = aws_ssm_parameter.initial_admin_password.arn
      },
    ]

    readonlyRootFilesystem = true

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.backend.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "seed"
      }
    }
  }])
}

resource "aws_ecs_service" "backend" {
  name            = "${local.name_prefix}-backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 0
  launch_type     = "FARGATE"

  platform_version                  = "LATEST"
  health_check_grace_period_seconds = 60
  wait_for_steady_state             = false
  enable_ecs_managed_tags           = true
  propagate_tags                    = "SERVICE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "backend"
    container_port   = 8080
  }

  # Task Definition revisionと起動数はMigration成功後のCDが管理する。
  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  depends_on = [aws_lb_listener_rule.cloudfront]
}
