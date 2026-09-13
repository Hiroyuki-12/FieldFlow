# RDS TLS CA

`ap-northeast-1-bundle.pem`はAmazon RDS Trust Storeが公開する東京Region用CA bundleである。秘密情報ではなく、ECSからRDS MySQLへ接続するときにサーバー証明書を検証するためBackend imageへ同梱する。

- Source: `https://truststore.pki.rds.amazonaws.com/ap-northeast-1/ap-northeast-1-bundle.pem`
- Retrieved: 2026-09-10
- SHA-256: `d1df75221341812a657d7c7b070ff61ce78824fbf05acf499f7e394f5ff58d50`

AWSがCAをrotationした場合は公式bundleを再取得し、certificate一覧、checksum、Backend TLS単体テスト、Docker buildを確認して更新する。
