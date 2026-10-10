# 审计截图证据的归档说明

本目录（`audit/`）为 2026-10-10 云端对抗性审计的可追溯证据归档。

## 截图文件说明

云端交付包中 `audit/` 目录包含 68 张 PNG 截图（约 13.7 MB），分布在以下子目录：

- `audit/browser/high-score-web/`（4 张）
- `audit/browser/high-score-android-host/`（4 张）
- `audit/browser/quality-web/`（11 张）
- `audit/browser/quality-android-host/`（6 张）
- `audit/concurrency/browser/`（2 张）
- `audit/input/browser/baseline/`（9 张）
- `audit/input/browser/fixed/`（13 张）
- `audit/input/browser/fixed-android-host/`（14 张）
- `audit/input/browser/fixed-keyboard-resize/`（5 张）

依据仓库惯例（Git 中仅跟踪运行必需的 mp3 音频与应用图标，不纳入任何截图类
证据文件），这 68 张截图**未纳入版本库**。截图文件名与逐张清单完整记录在
云端交付包 `MANIFEST-SHA256.txt`（本目录内有副本）中，交付包 ZIP 的
SHA-256 为：

```
5416538db8f8ae3e23e0f1e2c29e4233d4879ab523ce86eccaf25b83311c3db2
```

所有非截图证据（审计脚本、探针、JSON 结果、日志、报告 Markdown、补丁）均已
完整入库，文档（`docs/AUDIT_2026-10-10.md`、`docs/TEST_RESULTS_2026-10-10.md`、
`CLOUD-HANDOFF.md`、`audit/README.md`）引用的 `audit/` 路径不受影响——没有任何
文档逐文件引用具体 `.png` 文件名。

如需复核截图证据，从持有交付包的一方按上述 SHA-256 验证 ZIP 后解压即可。
