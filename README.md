<div align="center">

# 🧩 Relax Block Puzzle

**One block-puzzle game. Three distinct platforms.**

轻松俄罗斯方块：以 10 × 10 棋盘为核心的休闲方块拼放游戏，涵盖微信小游戏、Android 与 Web 三个平台。

[**Android releases**](https://github.com/seiya058904/Relax-Block-Puzzle/releases/tag/v1.0.12) · [Game specification](docs/UNIFIED_SPEC.md) · [Platform architecture](docs/PLATFORM_SYNC.md) · [Test evidence](docs/TEST_BASELINE.md)

![Web](https://img.shields.io/badge/platform-Web-3478f6?style=flat-square) ![Android](https://img.shields.io/badge/platform-Android-3ddc84?style=flat-square) ![WeChat](https://img.shields.io/badge/platform-WeChat%20Mini%20Game-07c160?style=flat-square)

</div>

## 🎮 The game / 游戏概览

在 10 × 10 棋盘中安排不同形状的方块，围绕有限空间进行连续决策。项目重点是轻量操作、触控反馈，以及跨不同设备保持一致的核心玩法。

| Platform | Where it lives | What to know |
| --- | --- | --- |
| **WeChat Mini Game** | [`we xin xiao cheng xu/`](we%20xin%20xiao%20cheng%20xu/) | 产品行为基准；使用微信开发者工具预览与真机验证 |
| **Android** | [`we xin xiao cheng xu-android-apk/`](we%20xin%20xiao%20cheng%20xu-android-apk/) | Kotlin/Gradle + WebView，单独的生命周期与适配层 |
| **Web** | [`we xin xiao cheng xu-android-apk/docs/`](we%20xin%20xiao%20cheng%20xu-android-apk/docs/) | 浏览器入口，共享规则但保留独立 UI / 资源适配 |

> 三个平台不是三个独立重写的游戏。共享逻辑来自 [`shared/js/`](shared/js/)，生成目标由 [`config/platform-manifest.json`](config/platform-manifest.json) 定义。

## 📦 Android packages / Android 安装包

仓库记录的 Android 发行版本是 **v1.0.12 / versionCode 12**：

**[View v1.0.12 release](https://github.com/seiya058904/Relax-Block-Puzzle/releases/tag/v1.0.12)**

- **Release APK 为未签名包，不能直接安装**；需要自行完成适当的发布签名流程。
- **Debug preview APK 可以安装**，但它使用调试证书，**不等于正式签名的生产安装包**。
- 发行附件包含校验和。物理 Android 及微信设备的部分交互仍需要额外人工验证。

详细说明见 [Android 文档](we%20xin%20xiao%20cheng%20xu-android-apk/README.md) 和 [Release notes](we%20xin%20xiao%20cheng%20xu-android-apk/release-notes/)。

## 🛠️ Develop & verify / 开发与验证

修改跨平台公共规则时，**只修改权威共享源**，再执行同步；不要直接修改生成的各平台副本。

```powershell
npm test
npm run verify
npm run verify:assets
npm run verify:apk-assets
```

Android Debug 构建在 Android 子项目目录执行：

```powershell
cd "we xin xiao cheng xu-android-apk"
.\gradlew.bat assembleDebug
```

微信小游戏请通过微信开发者工具打开 `we xin xiao cheng xu/`；触摸、音频、震动、安全区域和前后台行为不能仅凭 Chromium 测试代替真机验证。

## 📚 Further reading

- [Unified specification](docs/UNIFIED_SPEC.md) — 产品与技术契约
- [Platform synchronization](docs/PLATFORM_SYNC.md) — 共享源与派生副本
- [Parity audit](docs/PARITY_AUDIT.md) — 多平台行为对齐
- [Test baseline](docs/TEST_BASELINE.md) — 已覆盖与未覆盖的验收边界
- [Repository guide](AGENTS.md) — 维护规则与安全约束

发布与开发所需的配置、签名凭据、SDK、APK 与生成产物不应提交到仓库。
