# PPTX Slide Studio (OpenXmlSdkTs 版)

> [!NOTE]
> このリポジトリのコードは [Claude Code](https://claude.com/claude-code) (Anthropic の AI コーディングエージェント) を利用して作成されました。
> [demo-office-open-pptx-slide-app](https://github.com/strozw/demo-office-open-pptx-slide-app) (`@office-open/pptx` 版) を、[`openxmlsdkts`](https://www.npmjs.com/package/openxmlsdkts) を使って PPTX を生成するように移植したバージョンです。

ブラウザ上でスライドを作成し、[`openxmlsdkts`](https://github.com/EricWhiteDev/OpenXmlSdkTs) (Open XML SDK for TypeScript) を使って PowerPoint (.pptx) ファイルとして書き出せるスライド作成アプリケーションです。

## 機能

- **矩形選択 (マーキー選択)** — キャンバスの何もない場所からドラッグすると選択矩形が表示され、矩形に「触れた」(交差した) オブジェクトがすべて選択されます。クリックで単一選択、Shift+クリックで追加選択も可能です。
- **テキストの縦・横位置指定** — テキストボックス / 図形内テキストの横位置 (左・中央・右・両端) と縦位置 (上・中央・下) をインスペクタで指定でき、それぞれ OOXML の `algn` (段落配置) と `anchor` (テキストボディのアンカー) として書き出されます。
- **文字単位の書式指定** — テキスト全体の基本書式に加え、**一文字単位**でフォントファミリー (既定 / Noto Sans JP / Noto Serif JP、静的 TTF を [`public/fonts`](apps/web/public/fonts) に同梱・OFL ライセンス)・フォントサイズ・色・太字・斜体を上書きできます。書き出し時は同一書式が連続する区間ごとに `a:r` (ラン) を分割し、`sz` / `b` / `i` / `a:solidFill` / `a:latin` / `a:ea` として出力。読み込み時はランから書式を復元します。
- **オブジェクト上のテキスト編集** — 図形 / テキストボックスをダブルクリックするとオブジェクト上でテキストを直接編集できます (Escape で終了)。編集中も文字単位の書式どおりに表示されます (透明テキストの textarea の背後に、実書式で描画するミラーを重ねる方式)。編集中に Shift+矢印キーやドラッグで文字を選択すると、選択範囲の情報が右のインスペクタに表示され、その範囲へフォント・サイズ・色・太字・斜体を適用できます。
- **複数シェイプの描画** — 長方形・角丸四角形・楕円・三角形・ひし形・右矢印・星・六角形を配置でき、塗りつぶし色・枠線・テキストを編集できます。ドラッグ移動、8 方向ハンドルでのリサイズ、複製、前面/背面の並べ替えに対応しています。
- **OOXML グラフの描画** — 縦棒・横棒・折れ線・面・円・ドーナツ・散布図・レーダー・バブル・株価・等高線の各グラフを配置し、タイトル・カテゴリ・系列データ・凡例を編集できます。書き出し時はネイティブの DrawingML チャートパート (`ppt/charts/chartN.xml`) として埋め込まれるため、PowerPoint 上でデータ編集可能なグラフになります。
- **グラフの画像書き出し + 再編集メタデータ** — チャートごとに「画像として書き出す」を指定でき、エディタの SVG プレビューを PNG 化して `p:pic` + メディアパートとして埋め込みます。エディタのチャートモデル JSON が `p:cNvPr/a:extLst` (独自 `a:ext`) と PNG 自体の iTXt チャンクの両方にメタ情報として埋め込まれるため、画像化してもこのアプリで開き直せば編集可能なグラフに復元されます。
- **書き出しモーダル** — 「PPTX を書き出し」でモーダルが開き、ファイル名の変更、**フォントのファイル埋め込み**、**全グラフの画像化** (グラフがあるときのみ表示) を選択して書き出せます。書き出しファイルの拡張子は **`.my.pptx`** です (末尾が `.pptx` なので中身は通常の PPTX として PowerPoint で開けます)。フォント埋め込みは、使用中の Noto Sans/Serif JP の Regular / Bold を `p:embeddedFontLst` + `.fntdata` パートとして埋め込みます。PowerPoint の埋め込みフォントは**静的な TTF インスタンスのみ対応** (バリアブルフォントや woff2 は黙って無視されて代替フォント表示になる) なので、エディタの表示と埋め込みで同じ静的 TTF (`public/fonts`) を使っています。
- **PPTX の読み込み** — このアプリで書き出した .pptx をツールバーの「開く」から読み込み、図形・テキスト・グループはスライド OOXML の逆パースで、グラフ (ネイティブ / 画像化どちらも) は埋め込みメタデータから編集可能な状態に復元します。
- **画像の挿入** — ツールバーの「画像」から PNG / JPEG / GIF を挿入できます (キャンバスに収まるサイズへ自動フィット)。書き出しは `p:pic` + `/ppt/media` のメディアパートとして出力され、読み込みで復元されます (再編集メタデータを持つ「グラフの画像書き出し」とはメタデータの有無で区別)。
- **グループ化 (ネスト対応)** — 複数オブジェクトをグループ化 / グループ解除できます。グループを含む選択をさらにグループ化するとネストしたグループになり、OOXML でも `p:grpSp` の入れ子として書き出されます。グループはまとめて移動・リサイズできます。キャンバスでグループ内の要素をダブルクリックすると 1 階層ずつ選択が降りていき (ネストしたグループは直下のグループ → その中の要素の順)、選択後はその階層のままクリック・ドラッグで兄弟要素の選択や移動ができます。
- **サイドバーのタブ (スライド / オブジェクト)** — 左サイドバーは「スライド」(サムネイル一覧) と「オブジェクト」の 2 タブ構成です。「オブジェクト」タブは現在のスライドのオブジェクトを前面→背面の順でツリー表示し、グループは展開 / 折りたたみできます。クリックで選択 (Shift+クリックで追加選択) でき、グループ内のオブジェクトも個別に選択してインスペクタで編集できます。行のドラッグ&ドロップで重ね順を変更でき、上 (リスト上部) に置くほど前面になります (並べ替えは同じ階層内)。
- **undo / redo** — ツールバーのボタンまたは ⌘/Ctrl+Z (元に戻す)・⇧⌘/Ctrl+Z / Ctrl+Y (やり直し)。ドキュメント (デッキ) を変更する操作のみが履歴対象で、選択やスライド切り替えなどの UI 状態は対象外です。ドラッグ移動やタイピングのような連続操作は 1 つの取り消し単位にまとめられます (履歴上限 100 件)。
- **コンテキストメニュー** — 右クリックで操作メニューを表示します。スライド一覧のスライドは「削除」(1 枚のみのときは無効)、オブジェクト一覧・キャンバス上のオブジェクトは「グループ化 (複数選択時) / グループ解除・複製・削除」、キャンバス上ではさらに「最前面へ移動 / 最背面へ移動」が使えます。
- **コネクタ** — 2 つのオブジェクトを選択してツールバーまたは右クリックの「コネクタで接続」で、図形・テキストボックス・グラフを結ぶコネクタ (直線 / カギ線、矢印あり/なし、線色・太さ) を作成できます。接続先の移動・リサイズに自動追従し、書き出しは OOXML 準拠の `p:cxnSp` + `a:stCxn`/`a:endCxn` (意味的な接続参照) として出力されるため、**PowerPoint 上で図形を動かしてもコネクタが追従する本物のコネクタ**になります。接続サイトは上下左右の 4 点 (接続サイト番号は rect 系の並びで近似)。コネクタを選択すると始点・終点にハンドルが表示され、**ドラッグで別のオブジェクト / 接続サイトに付け替え**できます (ドラッグ中は候補サイトと最寄り点をハイライト表示)。インスペクタから始点と終点の反転もできます。
- **複数スライド** — スライドの追加・削除・切り替え、スライド背景色の設定、スピーカー向けサムネイル一覧。
- **スライド再生** — スライド一覧の下部に固定の再生コントロール (前へ / 再生・停止 / 次へ)。再生するとキャンバスが読み取り専用の再生ビューに切り替わり (右サイドバーは非表示)、← / → キーでスライドを移動できます。マウスオーバーで右上に全画面切り替えボタンが表示され、全画面中は Esc で元のウィンドウ表示に戻ります。停止で元の編集画面に復帰します。

## openxmlsdkts による PPTX 生成について

`@office-open/pptx` が「宣言的なオプションオブジェクト → .pptx」の高レベル API を提供するのに対し、`openxmlsdkts` は Open XML パッケージ (パーツ + リレーションシップ) を LINQ to XML ([`ltxmlts`](https://www.npmjs.com/package/ltxmlts)) で直接操作する低レベル SDK です。このアプリでは [`apps/web/src/lib/pptx/`](apps/web/src/lib/pptx) に小さな生成レイヤーを実装しています。

- **パッケージの新規作成** — openxmlsdkts には空パッケージを作る API がないため、空の Flat OPC 文字列を `PmlPackage.open()` で開き、`addPart` / `addRelationship(ForPart)` で presentation / slideMaster / slideLayout / theme / slide / chart / docProps の全パーツをゼロから組み立てます ([`generate.ts`](apps/web/src/lib/pptx/generate.ts))。
- **XML 構築** — 各パーツの OOXML は ltxmlts の `XElement` と、openxmlsdkts の事前初期化済み XName 定数 (`P` / `A` / `C` / `R` など) で構築します。
- **チャートデータ** — カテゴリ / 値はリテラルキャッシュ (`c:strLit` / `c:numLit`) として埋め込むため、ワークシートパートは不要です ([`chart.ts`](apps/web/src/lib/pptx/chart.ts))。
- **シリアライズの癖** — ltxmlts は属性をシングルクォート、自己終了タグを `<a:off ... />` (空白付き) で出力します。また、openxmlsdkts が内部生成する `[Content_Types].xml` / `.rels` のデフォルト名前空間宣言は ltxmlts のシリアライザに認識されない形式のため、保存前に正規の宣言へ置き換えています (`canonicalizeDefaultNamespace`)。
- **ブラウザバンドル** — ltxmlts はファイル読み込みヘルパーのためにモジュールトップレベルで `fs` を import しています。ブラウザでは呼ばれないため、[`next.config.ts`](apps/web/next.config.ts) でクライアントバンドルからスタブ ([`fs-stub.ts`](apps/web/src/lib/fs-stub.ts)) に差し替えています。

## グラフの画像書き出しと再編集メタデータについて

「画像として書き出す」を指定したチャートは、ネイティブチャートパートの代わりに `p:pic` + `/ppt/media/imageN.png` として書き出されます ([`slide.ts`](apps/web/src/lib/pptx/slide.ts) の `picElement`)。PNG はエディタのチャートプレビュー (SVG) を canvas で 2x ラスタライズしたものです ([`rasterize-chart.ts`](apps/web/src/lib/rasterize-chart.ts))。

再編集用のメタデータ (エディタの `ChartObject` JSON) は 2 箇所に埋め込まれます ([`chart-meta.ts`](apps/web/src/lib/pptx/chart-meta.ts)):

1. **`p:cNvPr/a:extLst/a:ext uri="{8F2C3A41-…}"`** — OOXML 標準の拡張スロット。PowerPoint は未知の拡張をラウンドトリップで保持します。ネイティブチャートの `p:graphicFrame` にも同じメタデータを付けているため、読み込み時にチャート XML を逆パースする必要がありません (主経路)。
2. **PNG の iTXt チャンク** (keyword `pptx-slide-studio:chart`) — 画像単体を取り出しても情報が残るフォールバック ([`png-text.ts`](apps/web/src/lib/png-text.ts))。Excalidraw や draw.io が PNG に元データを埋め込むのと同じ手法です。

「開く」での復元 ([`import-pptx.ts`](apps/web/src/lib/import-pptx.ts)) は、図形・テキスト・グループをスライド OOXML から逆パースし、チャートは extLst → PNG チャンクの順でメタデータを探して復元します。座標は常にスライド上の実際の `a:xfrm` を優先するため、PowerPoint 側で移動・リサイズしたチャートも移動後の位置で復元されます。なお PowerPoint が画像を再圧縮すると PNG チャンクは失われることがあります (extLst が主経路なのはこのため)。

## グループの座標系について

このアプリの生成レイヤーはグループ図形の子オフセット (`a:chOff` / `a:chExt`) をグループ自身のオフセット / サイズと同値で書き出します。そのため **グループ配下の子要素の座標はグループ相対ではなく、スライド絶対座標のまま** 書き出せます。エディタのデータモデル自体が子要素を絶対座標で保持しており ([`types.ts`](apps/web/src/features/editor/types.ts) の `GroupObject`)、書き出しは 1:1 のマッピングです ([`export-pptx.ts`](apps/web/src/lib/export-pptx.ts) の `groupChild`)。`scripts/validate-export.mts` で `chOff == off` と子要素の絶対座標を検証しています。

## 座標の単位について

生成レイヤーの座標はすべて EMU (English Metric Unit, 914400/インチ) の数値で受け取ります。エディタのキャンバスは 1280×720px で 16:9 スライド (12192000×6858000 EMU) と 1:1 に対応し、`pxToEmu` (1px = 9525 EMU / 96dpi) で変換します。

## 技術スタック

- [TypeScript](https://www.typescriptlang.org/)
- [openxmlsdkts](https://github.com/EricWhiteDev/OpenXmlSdkTs) + [ltxmlts](https://www.npmjs.com/package/ltxmlts) (LINQ to XML for TypeScript)
- [React 19](https://react.dev/) + [React Compiler](https://react.dev/learn/react-compiler) ([Next.js 16](https://nextjs.org/) / `reactCompiler: true`)
- [shadcn/ui](https://ui.shadcn.com/) (Tailwind CSS v4 / radix-ui) — `apps/web` + `packages/ui` の monorepo 構成
- [React Doctor](https://github.com/millionco/react-doctor) — `pnpm doctor`
- [Oxlint](https://oxc.rs/docs/guide/usage/linter) — `pnpm lint`
- [Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html) — `pnpm format`
- [Turborepo](https://turborepo.com/) + [pnpm workspace](https://pnpm.io/workspaces)

## 開発

```bash
pnpm install

# 開発サーバー (http://localhost:3000)
pnpm dev

# 本番ビルド
pnpm build

# 型チェック / リント / フォーマット / React Doctor
pnpm typecheck
pnpm lint
pnpm format
pnpm doctor

# PPTX 書き出しの検証 (生成された OOXML をアサーション)
pnpm --filter web test:export
```

## ディレクトリ構成

```
apps/web                  # Next.js アプリ (スライドエディタ)
  src/features/editor     # エディタ本体 (store / canvas / inspector / toolbar ...)
  src/lib/pptx            # openxmlsdkts ベースの PPTX 生成レイヤー
    types.ts              #   宣言的ドキュメントモデル (EMU 単位)
    generate.ts           #   パッケージ組み立て (パーツ + リレーションシップ)
    slide.ts              #   スライド XML (図形 / テキスト / グループ / graphicFrame)
    chart.ts              #   DrawingML チャートパート (11 種)
    theme.ts              #   テーマパート
  src/lib/export-pptx.ts  # エディタモデル → PresentationDoc 変換 & ダウンロード
  src/lib/import-pptx.ts  # PPTX → エディタモデル復元 (OOXML 逆パース + メタデータ)
  src/lib/rasterize-chart.ts # チャート SVG プレビュー → PNG ラスタライズ
  src/lib/png-text.ts     # PNG iTXt チャンクの挿入 / 読み取り
  scripts/validate-export.mts # 書き出し結果の OOXML 検証 + インポート往復検証
packages/ui               # 共有 UI (shadcn/ui コンポーネント)
```
