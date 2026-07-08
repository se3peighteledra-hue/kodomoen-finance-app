# Netlifyで公開する方法

このアプリはNetlify向けに、次の構成で公開できます。

- 画面：静的HTML/CSS/JavaScript
- WAM NET検索・財務解析：Netlify Functions
- 問い合わせ集計：Netlify Forms
- Instagram導線：[@rx8_real_estate_leasing](https://www.instagram.com/rx8_real_estate_leasing/)

## 1. GitHubへアップロード

この `kodomoen-finance-app` フォルダをGitHubにアップロードします。

リポジトリ全体をアップロードする場合は、Netlify側でBase directoryに次を指定します。

```text
outputs/kodomoen-finance-app
```

## 2. Netlifyで新規サイトを作成

Netlifyで「Add new site」→「Import an existing project」を選び、GitHubリポジトリを接続します。

設定値は次の通りです。

| 項目 | 値 |
| --- | --- |
| Base directory | `outputs/kodomoen-finance-app` |
| Build command | `npm run build` |
| Publish directory | `netlify-site` |
| Functions directory | `netlify/functions` |

`netlify.toml` にも同じ設定を書いてあるため、Netlifyが自動で読み取れる場合があります。

## 3. 問い合わせフォームを有効化

Netlify管理画面で Forms を開き、Form detection を有効化してください。

次回デプロイ後、`contact` というフォームが検出されます。送信内容はNetlify管理画面の Forms に集計されます。

フォームには次の内容が入ります。

- お名前
- 返信先メール
- 相談内容
- 選択した園名
- 法人名
- 住所
- 公開年度
- 診断結果

## 4. 通知を受け取りたい場合

Netlify管理画面の「Notifications」から、フォーム送信時のメール通知を追加できます。

## 5. 公開URL

デプロイが完了すると、Netlifyが次のようなURLを発行します。

```text
https://xxxxx.netlify.app
```

このURLを共有すれば、誰でもスマホやPCからアクセスできます。

## 注意

- WAM NETからその場で公開資料を取得するため、検索や分析に数秒かかることがあります。
- WAM NET側の画面やPDF様式が変わると、取得・解析ロジックの調整が必要になる場合があります。
- 大量アクセス用途では、WAM NETへの負荷に配慮してキャッシュや利用制限を追加してください。
