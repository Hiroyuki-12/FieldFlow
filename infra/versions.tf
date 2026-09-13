terraform {
  required_version = ">= 1.10.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }

  # state用S3 bucketをbootstrap後、backend.hclを指定して初期化する。
  # use_lockfileによりDynamoDBを増やさずS3上で排他制御する。
  backend "s3" {
    use_lockfile = true
    encrypt      = true
  }
}
