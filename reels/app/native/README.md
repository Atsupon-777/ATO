# Editless iPhone / Android アプリ（Capacitor）

Web版と同じ React の画面を**アプリ内に同梱**し（サイトを読み込むだけの作りではない＝審査4.2対策）、
API・動画・フォントは `https://reels.ato-sns.com` のサーバーから取ります。
APIキーはアプリに入れません。AIも課金の判定もサーバー側です。アプリが受け取るのは公開してよい値
（Firebase の設定と RevenueCat の公開SDKキー）だけで、どちらも `/api/config` か Firebase の設定ファイルから来ます。

## 構成

| 機能 | アプリ側 | サーバー側 |
| --- | --- | --- |
| 画面 | `app/web/main.tsx` をそのまま同梱（`scripts/build-native.mjs` → `app/native/www`） | なし |
| ログイン | ネイティブの Firebase（Apple・Google・メール、`@capacitor-firebase/authentication`） | 同じ ID トークンを `server/auth.ts` で確認 |
| Appleでサインイン（審査4.8） | ログイン画面のいちばん上 | Apple のユーザーはメール確認なしで通す |
| 写真ライブラリから素材 | `@capawesome/capacitor-file-picker`（HEIC は JPEG に変換） | 既存の `/api/upload` |
| カメラロールに保存 | `@capacitor-community/media` | なし |
| 共有シート（Instagram・TikTok） | `@capacitor/share` | なし |
| 書き出し完了のプッシュ通知 | `@capacitor-firebase/messaging`（最初のリールを作ったときに許可を聞く） | `server/push.ts`（FCM、Cloud Run のサービスアカウントで送信） |
| アカウント削除（審査5.1.1(v)） | アカウント画面の一番下 | `DELETE /api/me`：Web のプラン解約、動画・素材・残高・ログインを削除。Apple ログインはトークンも取り消し |
| トークン購入 | App Store のアプリ内課金（RevenueCat）。価格は App Store の表示をそのまま出す | `POST /api/revenuecat/webhook` で同じアカウントの残高に加算 |
| 自分の動画の表示 | `<video>` に `?k=<メディアキー>` を付ける | `/api/media-key`（24時間有効の署名） |

Web では今までどおり Stripe。アプリ内では Stripe のボタンは出しません（Apple の規約）。
App Store で契約したプランは Web 側では「App Storeで契約中」と表示し、Stripe からは変更できません。

## 篤さんに用意してもらうもの

パスワードや秘密鍵は Claude に渡さないでください。下の「場所」に自分で入れるか、公開してよい値だけ教えてください。

### 1. Apple Developer

1. Identifiers で App ID を作る：Bundle ID `com.atosns.reelsstudio`（変えたい場合は登録前に教えてください。`capacitor.config.ts` と Xcode を合わせます）
2. その App ID で **Sign in with Apple** と **Push Notifications** をオンにする（In-App Purchase は最初からオン）
3. Keys で **APNs 用のキー（.p8）** を作り、Firebase コンソール → プロジェクトの設定 → Cloud Messaging → Apple アプリの構成 にアップロード（Key ID と Team ID もそこで入力）

### 2. Firebase コンソール（プロジェクト reel-studio-511907）

iPhone 用は設定済みです（2026-10-21）：iOS アプリ「Editless」を登録し、`GoogleService-Info.plist` を `reels/ios/App/App/` に置いて Xcode プロジェクトに追加、`Info.plist` の2か所も埋め、Authentication の **Apple** ログインも有効にしました。

残り：
1. Android も出すとき：Android アプリ（パッケージ名 `com.atosns.reelsstudio`）を追加、`google-services.json` を `reels/android/app/` に置き、Google ログイン用に SHA-1 を登録

`GoogleService-Info.plist` と `google-services.json` は秘密ではありません（アプリに入る公開設定）。

### 3. App Store Connect

1. 新規 App（バンドルID `com.atosns.reelsstudio`、名前 Editless）
2. アプリ内課金を作る。製品IDはこの名前にしておくと設定不要です（変えた場合は `IAP_PRODUCT_*` で合わせます）

   | 製品ID | 種類 | 中身 |
   | --- | --- | --- |
   | `reels_tokens_10` | 消耗型 | 10トークン（Webの都度購入のように量は選べないので固定パック） |
   | `reels_starter_monthly` | 自動更新サブスクリプション（1か月） | スターター：毎月60トークン |
   | `reels_standard_monthly` | 同上 | スタンダード：毎月200トークン |
   | `reels_pro_monthly` | 同上 | プロ：毎月600トークン |

   3つのプランは同じサブスクリプショングループに入れてください。価格は篤さんが決めてください（Apple の手数料は Small Business Program で15%）。
3. 「アプリ内課金キー」（.p8）を作り、RevenueCat にアップロード

### 4. RevenueCat

1. プロジェクトを作り、App Store のアプリ（バンドルID上と同じ）を追加。上の .p8 を登録
2. Products に上の4つを取り込む
3. **公開SDKキー（`appl_` で始まる）** を教えてください。公開してよいキーです。サーバーの環境変数 `REVENUECAT_IOS_KEY` に入れ、アプリは起動時にサーバーから受け取ります
4. Integrations → Webhooks：URL `https://reels.ato-sns.com/api/revenuecat/webhook`。Authorization ヘッダーの値は、サーバーの Secret Manager `REVENUECAT_WEBHOOK_AUTH` と同じ文字列にします（デプロイのスレッドで作って Secret Manager に入れ、篤さんがそこからコピーして貼る流れが安全です）

### 5. Stripe（既存の制限付きキー）

アカウント削除で Web のプランを解約するため、制限付きキーの **Subscriptions を「書き込み」** に上げてください。

## Mac でビルドする

Xcode 26 以降と Node 22 が必要です。

```bash
cd reels
npm ci
npm run app:ios        # 画面をビルド → iOS プロジェクトへコピー → Xcode が開く
```

Xcode で App ターゲット → Signing & Capabilities → Team を選び、iPhone をつないで ▶。
初回は Swift Package の取得に数分かかります。Android は `npm run app:android`（Android Studio が開きます）。

画面のコードを変えたら `npm run app:build`（iOS と Android の両方にコピー）だけでアプリに入ります。
試験用に別のサーバーへつなぐときは `API_ORIGIN=https://… npm run app:build`。

## サーバー側の反映

このコードのサーバー部分（アプリからの通信の許可、削除、通知、課金の受け口）は、デプロイして初めて本番に入ります。
デプロイ時に `deploy/deploy.sh` が FCM API を有効にし、Cloud Run のサービスアカウントに
`roles/firebaseauth.admin`（アカウント削除）と `roles/firebasecloudmessaging.admin`（通知）を付けます。

## まだのこと（③ TestFlight → 審査）

- 審査用テストアカウント、プライバシー表示（App Privacy）、スクリーンショット（実際のテンプレ出力のみ）
- 権限の説明文（写真・通知）は今は日本語のみ。英語などを足すなら InfoPlist.strings を追加
- Android の提出（コードは同じ。`google-services.json` と Play Console の設定が要る）
