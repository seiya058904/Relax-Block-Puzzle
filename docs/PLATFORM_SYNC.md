# 三端同步边界

## 当前关系

- 微信产品源码：`we xin xiao cheng xu/`
- 网页构建目录：`we xin xiao cheng xu-android-apk/docs/`
- Android WebView 资源目录：`we xin xiao cheng xu-android-apk/app/src/main/assets/`
- 共享源码：`shared/js/`
- 清单：`config/platform-manifest.json`

统一仓库以本项目根目录为边界，三端、共享源码和验证脚本均在同一仓库中。源码交接 ZIP 不包含 `.git`；解压后的目录没有 Git 历史，不代表 Android 子目录是另一个权威仓库。以交接说明记录的基线和文件清单核对离线修改。

## 命令

```powershell
npm run sync
npm run verify
npm run verify:assets
npm test
```

同步脚本只处理 `config/platform-manifest.json` 中的 `generated` JS 文件。生成副本第一行带有：

```js
// GENERATED FILE - edit shared/js source and run npm run sync.
```

不要直接编辑带有该标记的文件；平台入口、HTML、`browser-wx-shim.js`、Canvas/DPR、生命周期、Kotlin 外壳和音频目录均不参与同步。

## 文件分类

共享基线：`Board.js`、`Piece.js`、`ScoreManager.js`、`utils/storage.js`、`coreConstants.js`、`DragModel.js`、`FrameInputQueue.js`、`SafeHitArea.js`、`RenderPerfStats.js`、`Presentation.js` 和 `config/quality.js`。

平台独立：`GameState.js`、`InputManager.js`、`Renderer.js`、`LayoutMetrics.js`、`constants.js`、`main.js`、`render.js`、HTML、shim、Android Kotlin 和全部音频。上述平台层现在调用共享拖拽模型和输入队列，但仍保留各自的生命周期、Canvas/DPR 和 Renderer 适配。

目录状态：`shared/js/` 是共享源代码；三个目标目录中的带生成标记 JS 是生成副本；各端入口、Renderer、生命周期、Canvas/DPR、shim 和音频是平台专用源码；旧射击模板代码已移除；Android `app/src/main/assets/js/js/` 是禁止进入发布包的路径。

## 稳定性规则

- 源文件和生成文件统一使用 UTF-8、LF、无 BOM。
- `npm run sync` 必须可重复执行；第二次执行应显示无差异。
- JS 同步工具不复制音频；微信轻量音频与 Android/Web 完整音频保持独立。交接包省略的 Android 重复镜像用 `node scripts/restore-android-audio.mjs` 恢复，再运行 `npm run verify:assets`。
- `npm run verify` 失败时先修复共享源或重新运行同步，再进行平台构建。
