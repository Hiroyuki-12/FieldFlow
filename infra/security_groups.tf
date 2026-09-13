resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb"
  description = "Public HTTP ingress for the CloudFront origin"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${local.name_prefix}-alb" }
}

resource "aws_security_group" "ecs" {
  name        = "${local.name_prefix}-ecs"
  description = "FieldFlow backend tasks"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${local.name_prefix}-ecs" }
}

resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-rds"
  description = "Private MySQL reachable only from FieldFlow backend tasks"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${local.name_prefix}-rds" }
}

# Security Group本体とruleを分け、ALB→ECS→RDSの相互参照を循環依存にしない。
resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  description       = "CloudFront reaches ALB; listener secret rejects direct requests"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "alb_to_ecs" {
  security_group_id            = aws_security_group.alb.id
  description                  = "Forward only to FieldFlow Fargate tasks"
  from_port                    = 8080
  to_port                      = 8080
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.ecs.id
}

resource "aws_vpc_security_group_ingress_rule" "ecs_from_alb" {
  security_group_id            = aws_security_group.ecs.id
  description                  = "Backend traffic from the ALB only"
  from_port                    = 8080
  to_port                      = 8080
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.alb.id
}

resource "aws_vpc_security_group_egress_rule" "ecs_https" {
  security_group_id = aws_security_group.ecs.id
  description       = "ECR, CloudWatch Logs, SSM and Secrets Manager APIs"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "ecs_dns_udp" {
  security_group_id = aws_security_group.ecs.id
  description       = "VPC DNS resolution over UDP"
  from_port         = 53
  to_port           = 53
  ip_protocol       = "udp"
  cidr_ipv4         = var.vpc_cidr
}

resource "aws_vpc_security_group_egress_rule" "ecs_dns_tcp" {
  security_group_id = aws_security_group.ecs.id
  description       = "VPC DNS fallback over TCP"
  from_port         = 53
  to_port           = 53
  ip_protocol       = "tcp"
  cidr_ipv4         = var.vpc_cidr
}

resource "aws_vpc_security_group_egress_rule" "ecs_to_rds" {
  security_group_id            = aws_security_group.ecs.id
  description                  = "TLS MySQL connection to FieldFlow RDS"
  from_port                    = 3306
  to_port                      = 3306
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.rds.id
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_ecs" {
  security_group_id            = aws_security_group.rds.id
  description                  = "MySQL from Fargate only"
  from_port                    = 3306
  to_port                      = 3306
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.ecs.id
}
