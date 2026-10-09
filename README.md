# 🧩 Relax Block Puzzle

**One block-puzzle game. Three distinct platforms.**

轻松俄罗斯方块：以 10 × 10 棋盘为核心的休闲方块拼放游戏，涵盖微信小游戏、Android 与 Web 三个平台。

**[Android release assets](https://github.com/seiya058904/Relax-Block-Puzzle/releases/tag/v1.0.12)** · [Platforms](#choose-a-platform) · [Build & verify](#development-and-parity) · [Design specification](docs/UNIFIED_SPEC.md)

## Choose a platform

Arrange blocks on a 10 × 10 board while space becomes scarce. The game shares its core rules across three hosts, but interaction and packaging are **platform-specific**.

在 10 × 10 棋盘中安排不同形状的方块，围绕有限空间进行连续决策。项目重点是轻量操作、触控反馈，以及跨不同设备保持一致的核心玩法。

| Platform | Where it lives | What to know |
| --- | --- | --- |
| **WeChat Mini Game** | [`we xin xiao cheng xu/`](we%20xin%20xiao%20cheng%20xu/) | 产品行为基准；使用微信开发者工具预览与真机验证 |
| **Android** | [`we xin xiao cheng xu-android-apk/`](we%20xin%20xiao%20cheng%20xu-android-apk/) | Kotlin/Gradle + WebView，单独的生命周期与适配层 |
| **Web** | [`we xin xiao cheng xu-android-apk/docs/`](we%20xin%20xiao%20cheng%20xu-android-apk/docs/) | 浏览器入口，共享规则但保留独立 UI / 资源适配 |

> 三个平台不是三个独立重写的游戏。共享逻辑来自 [`shared/js/`](shared/js/)，生成目标由 [`config/platform-manifest.json`](config/platform-manifest.json) 定义。

## Android APK — read before installing

> [!WARNING]
> The `v1.0.12` **Release APK is unsigned and cannot be installed as supplied**. Use the separately marked **Debug preview** only for testing; it is not a production-signed application.

仓库记录的 Android 发行版本是 **v1.0.12 / versionCode 12**：

**[View v1.0.12 release](https://github.com/seiya058904/Relax-Block-Puzzle/releases/tag/v1.0.12)**

- **Release** 附件提供可自行完成发布签名的包；**Debug preview** 使用调试证书，仅供测试。
- 发行附件包含校验和；部分物理 Android/微信交互尚需人工验证。

详细说明见 [Android 文档](we%20xin%20xiao%20cheng%20xu-android-apk/README.md) 和 [Release notes](we%20xin%20xiao%20cheng%20xu-android-apk/release-notes/)。

## Development and parity

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

## Documentation

- [Unified specification](docs/UNIFIED_SPEC.md) — 产品与技术契约
- [Platform synchronization](docs/PLATFORM_SYNC.md) — 共享源与派生副本
- [Parity audit](docs/PARITY_AUDIT.md) — 多平台行为对齐
- [Test baseline](docs/TEST_BASELINE.md) — 已覆盖与未覆盖的验收边界
- [Repository guide](AGENTS.md) — 维护规则与安全约束

发布与开发所需的配置、签名凭据、SDK、APK 与生成产物不应提交到仓库。
