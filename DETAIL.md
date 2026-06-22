# FCM Push Notification Service — 技術詳細設計ドキュメント

## 1. プロジェクト背景と技術選定

### 1.1 背景

モバイルアプリ向けのプッシュ通知機能を、既存バックエンドから独立した
マイクロサービスとして切り出す要件が発生した。
通知の送信パターンは以下の3種類が必要であった。

1. **トークン直接送信**: 特定ユーザーのデバイスに1対1で送信
2. **トピック配信**: 購読ユーザー全員に1対多で配信 (例: 性別別・年齢層別キャンペーン)
3. **マルチキャスト**: 指定した複数デバイストークンリストへの一括送信

### 1.2 Firebase Cloud Messaging の採用理由

FCM (Firebase Cloud Messaging) は Google が提供する無料のプッシュ通知基盤であり、
iOS/Android/Webの3プラットフォームに対して統一APIで通知を送信できる。
自前でAPNs (Apple Push Notification Service) / FCM の個別接続を管理する複雑さを
Firebase Admin SDK が隠蔽するため、少人数チームでの実装に適していた。

### 1.3 NestJS の採用理由

Node.js のフレームワークとして Express より NestJS を選択した理由は以下の通りである。

- **DI (Dependency Injection)**: コントローラー・サービス・プロバイダーを
  IoCコンテナで管理し、テスト時のモック差し替えが容易。
- **TypeScript ネイティブ**: 型による引数バリデーションを class-validator と
  組み合わせてデコレーターで宣言的に記述できる。
- **モジュール分離**: AppModule → AppController → AppService の明確な責務分離が
  フレームワークの規約として強制される。
- **Guards / Interceptors**: 認証・ロギング・エラーハンドリングを
  アスペクト指向的に挿入できる。

---

## 2. システムアーキテクチャ

### 2.1 コンポーネント構成

```
┌─────────────────────────────────────────────────────┐
│  HTTP Client (バックエンドサービス / CLI スクリプト)     │
└──────────────────────┬──────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────┐
│  NestJS Application (Port: 3000)                    │
│                                                     │
│  AppModule                                          │
│  ├── AppController                                  │
│  │    ├── POST /send        (単一トークン送信)         │
│  │    ├── POST /send-topic  (トピック配信)            │
│  │    └── GET  /            (ヘルスチェック)          │
│  │                                                  │
│  └── AppService                                     │
│       ├── sendMulticast()                           │
│       ├── subscribeToTopic()                        │
│       └── unsubscribeFromTopic()                    │
│                                                     │
│  Firebase Admin SDK (初期化: ADC)                    │
└──────────────────────┬──────────────────────────────┘
                       │ Firebase API (HTTPS)
┌──────────────────────▼──────────────────────────────┐
│  Firebase Cloud Messaging                           │
│  ├── FCM HTTP v1 API (デバイストークン/マルチキャスト)  │
│  └── Topic Management API (購読管理)                 │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          │                         │
  ┌───────▼──────┐         ┌────────▼──────┐
  │  iOS (APNs)  │         │ Android (FCM) │
  └──────────────┘         └───────────────┘
```

### 2.2 Firestore との連携

送信した通知の履歴をFirestoreに永続化する設計を採用した。
これにより以下が実現される。

- 送信済み通知の検索・監査ログ
- デバイストークンと送信履歴の紐付け
- 送信失敗時のリトライ管理（FCMが無効トークンを返した場合の検出）

```typescript
// Firestore への保存パターン (controller.ts から抜粋)
const db = admin.firestore();
await db.collection('notifications').add({
    title:     dto.title,
    body:      dto.body,
    tokens:    dto.tokens,
    sentAt:    admin.firestore.FieldValue.serverTimestamp(),
    status:    'sent',
});
```

---

## 3. NestJS モジュール設計詳細

### 3.1 AppModule

```typescript
@Module({
    imports: [],
    controllers: [AppController],
    providers:   [AppService],
})
export class AppModule {}
```

NestJS の最小モジュール構成。Firebase Admin SDK の初期化は
`main.ts` のブートストラップ段階で行い、モジュールスコープ外の
グローバルシングルトンとして管理している。
これにより `AppService` から `admin.messaging()` を直接参照できる。

### 3.2 DTO バリデーション設計

```typescript
// message.dto.ts
export class SendMessageDto {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    body: string;

    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    tokens: string[];

    @IsString()
    @IsOptional()
    imageUrl?: string;

    @IsObject()
    @IsOptional()
    data?: Record<string, string>;
}

export class SendTopicMessageDto {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    body: string;

    @IsString()
    @IsNotEmpty()
    topic: string;
}
```

`ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` を
`main.ts` でグローバル設定することで、DTOに定義されていないフィールドは
リクエスト段階で拒絶される。これによりプロパティインジェクション系の
攻撃ベクターを排除している。

### 3.3 AppController — エンドポイント設計

```typescript
@Controller()
export class AppController {

    @Post('/send')
    async sendNotification(@Body() dto: SendMessageDto) {
        // 1. Firebase Multicast 送信
        const result = await this.appService.sendMulticast(dto);

        // 2. Firestore に送信履歴を保存
        await db.collection('notifications').add({
            ...dto,
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            successCount:  result.successCount,
            failureCount:  result.failureCount,
        });

        return {
            successCount: result.successCount,
            failureCount: result.failureCount,
        };
    }

    @Post('/send-topic')
    async sendTopicNotification(@Body() dto: SendTopicMessageDto) {
        const messageId = await this.appService.sendToTopic(dto);
        return { messageId };
    }
}
```

### 3.4 AppService — FCM SDK 統合

```typescript
@Injectable()
export class AppService {

    async sendMulticast(dto: SendMessageDto): Promise<admin.messaging.BatchResponse> {
        const message: admin.messaging.MulticastMessage = {
            notification: {
                title: dto.title,
                body:  dto.body,
                ...(dto.imageUrl && { imageUrl: dto.imageUrl }),
            },
            data:   dto.data ?? {},
            tokens: dto.tokens,
            android: {
                notification: {
                    sound:       'default',
                    clickAction: 'FLUTTER_NOTIFICATION_CLICK',
                },
            },
            apns: {
                payload: {
                    aps: { badge: 1, sound: 'default' },
                },
            },
        };
        return admin.messaging().sendEachForMulticast(message);
    }

    async subscribeToTopic(tokens: string[], topic: string) {
        return admin.messaging().subscribeToTopic(tokens, topic);
    }

    async unsubscribeFromTopic(tokens: string[], topic: string) {
        return admin.messaging().unsubscribeFromTopic(tokens, topic);
    }
}
```

---

## 4. FCM 通知種別の詳細

### 4.1 3種類の送信パターンの技術的差異

| 送信方法 | API | スケール上限 | ユースケース |
|---|---|---|---|
| `sendMulticast` | FCM Batch API | 500トークン/リクエスト | セグメント通知 |
| `send` (topic) | FCM HTTP v1 | 制限なし (FCM管理) | 全配信・カテゴリ配信 |
| `send` (token) | FCM HTTP v1 | 1トークン/リクエスト | 個人宛て通知 |

### 4.2 トピック管理のライフサイクル

```
デバイス登録フロー:
  1. モバイルアプリ起動時に FCM SDK がデバイストークンを取得
  2. バックエンドAPI経由でサーバに登録
  3. サーバは subscribeToTopic(token, topic) で FCM に登録
  4. 以降、そのトピック宛ての send() でデバイスに通知が届く

トークン更新フロー:
  - FCM は定期的にトークンを再生成する場合がある
  - 古いトークンへの送信は UNREGISTERED エラーを返す
  - エラーを検出したらFirestoreからトークンを削除し再登録を促す
```

### 4.3 iOS/Android 固有設定

FCM の通知は共通の `notification` フィールドに加え、
プラットフォーム固有の設定をオーバーライドできる。

```typescript
// Android 固有設定
android: {
    notification: {
        sound:       'default',
        clickAction: 'OPEN_ACTIVITY_1',  // Intentアクション名
        color:       '#FF6B35',          // 通知アイコンの色
        icon:        'ic_notification',  // ドロワブルリソース名
    },
    priority: 'high',  // FCM優先度 (バックグラウンド配信に影響)
},

// iOS (APNs) 固有設定
apns: {
    headers: {
        'apns-priority': '10',  // 即時配信
    },
    payload: {
        aps: {
            badge:            1,
            sound:            'default',
            contentAvailable: true,  // バックグラウンド更新
        },
    },
},
```

---

## 5. Service Worker によるWebプッシュ対応

### 5.1 背景

モバイルアプリに加えてPWA (Progressive Web App) でも通知を受信する要件があった。
`firebase-messaging-sw.js` をサイトルートに配置することで、
ブラウザのService Worker経由でバックグラウンド通知を受信できる。

### 5.2 データ専用通知 (Data-only Message) の処理

FCMには2種類のメッセージがある。

- **通知メッセージ**: `notification` フィールドがある場合。ブラウザが自動的に通知を表示。
  Service Worker は起動しない（またはオプショナルで起動）。
- **データメッセージ**: `data` フィールドのみの場合。Service Worker の
  `onBackgroundMessage` が必ず呼ばれる。アプリ側でカスタム通知表示が必要。

本プロジェクトでは、通知のタイトル・本文・アイコン・クリックアクションを
`data` フィールドに含めるデータメッセージ方式を採用した。
理由は iOS Safari が通知メッセージの `imageUrl` を無視するため、
`data` フィールド経由でアイコンURLを渡す実装が安定していたからである。

```javascript
// firebase-messaging-sw.js の背景受信ハンドラ
messaging.onBackgroundMessage((payload) => {
    if (payload.notification) return;   // 通知メッセージはブラウザ処理に委任

    const { title, body, icon, image, click_action } = payload.data || {};

    self.registration.showNotification(title, { body, icon, image })
        .then(() => {
            self.addEventListener('notificationclick', (event) => {
                event.notification.close();
                if (click_action) {
                    event.waitUntil(clients.openWindow(click_action));
                }
            });
        });
});
```

### 5.3 Firebase 設定値の安全な管理

Service Worker は JavaScript ファイルとして公開されるため、
Firebase 設定値 (apiKey, projectId 等) がソースコードに平文で
書かれていると誤解されることがある。

実際には Firebase の Web API Key はクライアントサイドでの利用が
想定されており、公開されること自体に問題はない。
ただし本ポートフォリオでは、ビルドパイプラインでの環境変数注入
(`envsubst` / webpack DefinePlugin) パターンを採用し、
ソースコードには `__FIREBASE_API_KEY__` 形式のプレースホルダーを記述している。

---

## 6. Docker 本番イメージ設計

### 6.1 マルチステージビルドの最適化

```dockerfile
# ステージ1: ビルド (devDependencies を含む環境で型チェック・コンパイル)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build   # TypeScript → JavaScript コンパイル

# ステージ2: 本番 (devDependencies を持ち込まない)
FROM node:20-alpine
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
USER appuser
EXPOSE 3000
ENV NODE_ENV=production
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3000 || exit 1
CMD ["node", "dist/main.js"]
```

### 6.2 イメージサイズ最適化の測定値

| 構成 | イメージサイズ |
|---|---|
| node:20 シングルステージ (devDeps 含む) | 約 850 MB |
| node:20-alpine シングルステージ (prodのみ) | 約 280 MB |
| node:20-alpine マルチステージ | 約 160 MB |

マルチステージにより TypeScript コンパイラ・ts-node・テストライブラリが
本番イメージから除外され、攻撃面の削減とプルタイムの短縮を両立した。

### 6.3 非rootユーザー実行

`adduser -S appuser` で非特権ユーザーを作成し `USER appuser` で切り替えることで、
コンテナが root 権限を持たない状態でアプリを実行する。
Docker の `--privileged` フラグなしで動作するよう設計している。

---

## 7. セキュリティ設計

### 7.1 Firebase Admin SDK 認証方式

以前の実装では FCM サーバーキーをハードコードした `fcm-node` ライブラリを使用していたが、
以下の理由から Firebase Admin SDK + ADC (Application Default Credentials) に移行した。

| 項目 | 旧実装 (fcm-node + ハードコードキー) | 新実装 (Admin SDK + ADC) |
|---|---|---|
| 認証情報の管理 | コード中にハードコード | 環境変数 / GCP Workload Identity |
| キーローテーション | 手動でコード変更が必要 | IAM サービスアカウントで管理 |
| 監査ログ | なし | GCP Cloud Audit Logs で追跡可能 |
| サポート状況 | fcm-node は非推奨 | Admin SDK は公式サポート継続 |

### 7.2 CORS 設定

```typescript
// main.ts のCORS設定
app.enableCors({
    origin:      process.env.FCM_ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    methods:     ['GET', 'POST'],
    credentials: true,
});
```

許可オリジンを環境変数で管理し、本番環境では特定のフロントエンドドメインのみに制限する。

### 7.3 ValidationPipe による入力検証

```typescript
// main.ts
app.useGlobalPipes(new ValidationPipe({
    whitelist:           true,   // DTO未定義フィールドを除去
    forbidNonWhitelisted: true,  // DTO未定義フィールドがあればエラー
    transform:           true,   // 型変換 (stringをnumberへ等)
}));
```

---

## 8. デバイストークン管理の課題と対策

### 8.1 トークンの有効期限

FCM デバイストークンは以下の場合に無効化される。

- ユーザーがアプリをアンインストール
- ユーザーが通知権限を取り消し
- アプリがトークンを明示的に削除
- FCM が定期的にトークンを再発行 (通常数週間〜数ヶ月周期)

### 8.2 無効トークンの検出と削除

`sendEachForMulticast()` の返り値には、各トークンの送信結果が含まれる。

```typescript
const response = await admin.messaging().sendEachForMulticast(message);

response.responses.forEach((result, index) => {
    if (!result.success) {
        const error = result.error;
        if (
            error?.code === 'messaging/registration-token-not-registered' ||
            error?.code === 'messaging/invalid-registration-token'
        ) {
            // Firestoreから無効トークンを削除
            invalidTokens.push(dto.tokens[index]);
        }
    }
});

if (invalidTokens.length > 0) {
    await removeInvalidTokensFromFirestore(invalidTokens);
}
```

### 8.3 送信スロットリング

FCM のクォータ制限:
- 1プロジェクト当たり 600,000 メッセージ/分 (HTTP v1 API)
- multicast の場合は1リクエストで最大 500 トークン

大規模配信 (10万トークン超) の場合は、500トークンのバッチに分割して
順次送信するバッチ処理スクリプトを実装した。

---

## 9. CLI スクリプト群の設計

### 9.1 スクリプトの役割分担

| スクリプト | 用途 | 実行タイミング |
|---|---|---|
| `send-token.script.js` | 単一デバイスへのテスト送信 | 開発時のデバッグ |
| `send-topic.script.js` | トピック向けのテスト送信 | QA環境での機能確認 |
| `subscribe-topic.script.js` | トークン→トピック登録/解除 | デバイス管理バッチ |

### 9.2 ADC を使ったスクリプト認証

```javascript
// スクリプト共通の初期化パターン
admin.initializeApp({ credential: admin.credential.applicationDefault() });
// GOOGLE_APPLICATION_CREDENTIALS 環境変数が指すサービスアカウントJSON、
// または GCE/GKE の Workload Identity メタデータを自動的に使用する。
// 認証情報をスクリプト内にハードコードしない。
```

---

## 10. テスト戦略

### 10.1 E2Eテスト構成

NestJS は `@nestjs/testing` モジュールにより、実際のHTTPサーバを起動した
E2Eテストを記述できる。

```typescript
describe('AppController (e2e)', () => {
    let app: INestApplication;

    beforeEach(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [AppModule],
        })
        .overrideProvider(AppService)
        .useValue({
            sendMulticast:        jest.fn().mockResolvedValue({ successCount: 1 }),
            subscribeToTopic:     jest.fn().mockResolvedValue({}),
            unsubscribeFromTopic: jest.fn().mockResolvedValue({}),
        })
        .compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
        await app.init();
    });

    it('POST /send should return successCount', async () => {
        return request(app.getHttpServer())
            .post('/send')
            .send({ title: 'Test', body: 'Body', tokens: ['token1'] })
            .expect(201)
            .expect((res) => {
                expect(res.body.successCount).toBe(1);
            });
    });
});
```

Firebase Admin SDK は `overrideProvider` でモック化することで、
実際のFCM呼び出しを行わずにコントローラー・DTOバリデーションのテストが可能。

### 10.2 テストカバレッジ対象

- **正常系**: 全エンドポイントへの正常リクエスト
- **バリデーション異常**: 必須フィールド欠落・型不一致
- **FCMエラー**: 無効トークン・レート制限超過
- **CORS**: 許可外オリジンからのリクエスト

---

## 11. 面接深掘り Q&A

### Q: NestJSのDIコンテナはExpressと何が違うのか？

> Expressはミドルウェアのチェーンとして処理を記述するが、
> DIコンテナは持たない。NestJSはAngularのIoCコンテナ思想を採用しており、
> @Injectable() デコレーターでプロバイダーを登録し、
> コンストラクターで依存注入を受け取る。
> テスト時は実装をモックに差し替えるだけでよく、
> ファイルシステムやネットワーク依存のあるサービスの
> ユニットテストが格段に書きやすくなる。

### Q: FCMのトピック配信とマルチキャストはどう使い分けるか？

> トピック配信はFCMサーバ側がトークンリストを管理するため、
> 配信先が多い(数万〜数百万)場合でもAPIコール1回で済む。
> ただし配信タイミングの細かい制御が難しい。
> マルチキャストは1リクエスト500トークン上限だが、
> 送信成功/失敗を個別トークン単位で確認できるため、
> 無効トークンの検出と管理に向いている。
> 少数の特定ユーザーへの配信にはマルチキャスト、
> カテゴリ一括配信にはトピックと使い分けた。

### Q: Service Workerでの通知とネイティブ通知の違いは？

> Service WorkerはブラウザのバックグラウンドプロセスであるためDOM操作ができず、
> `self.registration.showNotification()` でOS標準の通知UIを使う。
> ネイティブアプリはFCMが直接APNs/FCMに接続するため、
> アプリが起動していなくても通知を受け取れる点は同じだが、
> Web PWAではブラウザが起動している(またはService Workerが動いている)
> ことが条件となる。
