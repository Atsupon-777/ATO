# Reels Studio を公開する手順（Google Cloud Run）

アプリ（画面・AI処理・動画の書き出し）を1つのコンテナにまとめ、Google Cloud Run の東京リージョンで動かします。
ユーザーが作った動画と素材、アカウントとトークン残高は Cloud Storage のバケットに保存します。

## 構成

| 役割 | 使うもの | 設定する値 |
| --- | --- | --- |
| サーバー | Cloud Run（4 vCPU / 8GB、常時1台） | `deploy/deploy.sh` |
| 保存先 | Cloud Storage（`/data` にマウント） | 自動で作成 |
| ログイン | Firebase Authentication（Google・メール） | `FIREBASE_PROJECT_ID` `FIREBASE_API_KEY` `FIREBASE_AUTH_DOMAIN` |
| 課金 | Stripe（月額プラン・トークン追加・解約ページ） | `STRIPE_SECRET_KEY` `STRIPE_WEBHOOK_SECRET` `STRIPE_PRICE_*` |
| AI | Gemini API（有料枠） | `GEMINI_API_KEY` |

ログインと課金は、値が入っていなければ自動でオフになります（ローカル開発用）。

## 1. Google Cloud

1. https://console.cloud.google.com でプロジェクトを作り、お支払い（請求先アカウント）を設定します。
2. Secret Manager に次の3つを登録します（値はチャットに貼らないでください）。
   - `GEMINI_API_KEY`
   - `STRIPE_SECRET_KEY`（手順3で取得）
   - `STRIPE_WEBHOOK_SECRET`（手順3で取得）

## 2. Firebase（ログイン）

1. https://console.firebase.google.com で「プロジェクトを追加」→ 手順1の Google Cloud プロジェクトを選びます。
2. 「Authentication」→「始める」→ ログイン方法で **Google** と **メール/パスワード** を有効にします。
3. 「プロジェクトの設定」→「マイアプリ」→ ウェブアプリ（</>）を追加し、表示される `apiKey` と `authDomain` を控えます。
4. 独自ドメインを使う場合は、Authentication →「設定」→「承認済みドメイン」に追加します。

## 3. Stripe（課金）

1. https://dashboard.stripe.com でアカウントを作り、本人確認と入金先口座を登録します。
2. まずテストモードのシークレットキー（`sk_test_...`）で、商品・価格・Webhook をまとめて作ります。

   ```sh
   STRIPE_SECRET_KEY=sk_test_... node deploy/stripe-setup.mjs https://<公開URL>
   ```

   月額 9,800円 / 29,800円 / 79,800円 と、トークン追加（30トークン 4,800円）を税込で作成し、`deploy/env.yaml` に貼る値を表示します。
   トークン追加の金額は `TOPUP_YEN=...` で変えられます。
3. Stripe の「設定」→「カスタマーポータル」を有効にし、プラン変更と解約を許可します。
4. テストで動作を確かめたら、本番キー（`sk_live_...`）でもう一度実行します。

## 4. デプロイ

```sh
cp deploy/env.example.yaml deploy/env.yaml   # 手順2・3の値を入れる
PROJECT_ID=<プロジェクトID> ./deploy/deploy.sh
```

最後に表示される URL が公開アドレスです。独自ドメインは Cloud Run の「カスタムドメイン」から割り当て、`PUBLIC_URL` に入れて再デプロイします。

## 5. 公開前に埋めるところ

`app/web/legal/` の3ページ（利用規約・プライバシーポリシー・特定商取引法に基づく表記）の黄色い【】に、事業者名・住所・連絡先・制定日などを入れてください。
内容は一般的なひな形なので、公開前に専門家の確認をおすすめします。

## 費用の目安

- Cloud Run（4 vCPU / 8GB を常時1台）：月 3〜4万円前後
- Cloud Storage：保存量に応じて（100GB で月 300円ほど）
- Stripe：決済ごとに 3.6%
- Gemini：動画1本あたり 1〜130円ほど（AI動画ありが最も高い）

利用者が増えたら、書き出しを別のサービスに分け、アカウントを Firestore に移して台数を増やせる形にします。
