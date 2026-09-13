resource "aws_db_subnet_group" "main" {
  name       = local.name_prefix
  subnet_ids = aws_subnet.private[*].id
  tags       = { Name = local.name_prefix }
}

resource "aws_db_instance" "main" {
  identifier = "${local.name_prefix}-mysql"

  engine         = "mysql"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db_password.result
  port     = 3306

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period = 7
  backup_window           = "18:00-18:30"
  maintenance_window      = "sun:19:00-sun:19:30"

  auto_minor_version_upgrade = true
  deletion_protection        = var.deletion_protection
  # 学習用環境はdestroy後のsnapshot課金を自動で残さない。必要な証跡は事前承認後に手動取得する。
  skip_final_snapshot   = true
  copy_tags_to_snapshot = true

  performance_insights_enabled = false
  monitoring_interval          = 0

}
