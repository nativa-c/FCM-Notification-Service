# FCM Push Notification Service

## プロジェクト概要

Firebase Cloud Messaging (FCM) を使用したプッシュ通知マイクロサービス。  
NestJS で実装した REST API が、デバイストークン単体・トピック一括・複数トークンの3方式に対応。

## 技術スタック

- **Runtime**: Node.js 18 / NestJS
- **通知基盤**: Firebase Admin SDK (FCM)
- **コンテナ**: Docker (multi-stage build)
- **バリデーション**: class-validator / class-transformer

## 担当内容

- NestJS サービス設計・実装
- FCM Admin SDK 統合（token / topic / multicast 対応）
- Docker multi-stage ビルド構成
- Dockerfile による本番イメージ最小化

## 保留コードファイル一覧

| ファイル | 内容 |
|---|---|
| 01_app.module.ts | NestJSモジュール定義 |
| 02_message.dto.ts | 通知リクエストDTO（バリデーション付き） |
| 03_Dockerfile | multi-stage Docker ビルド |
