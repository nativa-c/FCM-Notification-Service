# FCM Push Notification Service

## Project Overview / プロジェクト概要 / 项目简介

**English**  
A push notification microservice built with NestJS and Firebase Cloud Messaging (FCM).  
Supports three delivery modes: single device token, topic broadcast, and multicast (multiple tokens).

**日本語**  
Firebase Cloud Messaging (FCM) を使用したプッシュ通知マイクロサービス。  
NestJS で実装した REST API が、デバイストークン単体・トピック一括・複数トークンの3方式に対応。

**中文**  
基于 NestJS 和 Firebase Cloud Messaging（FCM）构建的推送通知微服务。  
REST API 支持三种发送方式：单设备 Token、主题广播和多播（多 Token）。

## Tech Stack / 技術スタック / 技术栈

- **Runtime**: Node.js 18 / NestJS
- **Notification / 通知基盤 / 通知平台**: Firebase Admin SDK (FCM)
- **Container / コンテナ / 容器**: Docker (multi-stage build)
- **Validation / バリデーション / 数据校验**: class-validator / class-transformer

## Responsibilities / 担当内容 / 负责内容

- NestJS service design and implementation
- FCM Admin SDK integration (token / topic / multicast)
- Docker multi-stage build configuration
- Production image minimization via Dockerfile

## Source Files / 保留コードファイル一覧 / 源码文件

| File | Description |
|---|---|
| `src/app.module.ts` | NestJS module definition |
| `src/message.dto.ts` | Notification request DTO (with validation) |
| `Dockerfile` | Multi-stage Docker build |
