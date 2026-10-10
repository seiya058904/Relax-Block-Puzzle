# Combo 暂停时钟独立方案审阅

## 方案判断

批准使用扣除暂停区间的墙钟：`(pausedAt ?? Date.now()) - excludedMs`。它保留已有 3000 ms 的清线窗口及 `> window` 的超时边界，解决暂停耗时误计；前台长时间无动画帧时仍继续计时，不需要让 idle 页面常驻 RAF。

暂停原因应为 `lifecyclePaused || !canAdvanceTime()`。`pausedAt` 必须只在未暂停→暂停的转换时设置，恢复时只累计一次当前暂停区间。重复 hide/show 和先恢复窗口、后关弹层等交错状态不应重复扣时或过早恢复。

运行时全局时钟与单次可撤销的 `comboState` 应分开：撤销恢复上次清线计数/逻辑时间，但不能回滚全局暂停区间累计。新局/首页重新建立 comboClock；清理时钟不应清除真实宿主 `lifecyclePaused` 标记。

## 按三端源码枚举的必要接入点

| 位置 | 接入理由 |
|---|---|
| `initializeHomeState` 末尾 | 直接写 `screen='home'` 并替换 ui、comboState，绕开 `setScreen`；须在新状态建立后同步 |
| `reset` | 重建 comboClock；末尾 `setScreen('playing')` 统一同步是否仍有父弹层/后台原因 |
| `setScreen` | 覆盖 help/home、reset、undo、revive 成功、gameover 的屏幕切换 |
| `setLayout` 在 `viewportBlocked` 变化时 | 本轮短视口回退也是独立暂停原因，恢复窗口尺寸不得覆盖仍有效的弹层/后台原因 |
| `openSettings` / `closeSettings` | 改变 `canAdvanceTime` 的直接 UI 标记 |
| `openPause` / `closePause` | 同上，重复调用也应保持幂等 |
| `openAdminPanel` / `closeAdminPanel` | 同上，虽正常位于首页，仍应与状态定义一致 |
| `openRevivePrompt` / `closeRevivePrompt` | 冻结等待用户确认的整个时段 |
| 三端 Main 的 background / foreground | 使用 `state.setLifecyclePaused`，独立于 RAF；保留 Main 既有隐藏/绘制/音频保护 |
| `handleLineClear` | 用逻辑墙钟比较清线间隔，不修改分数公式、窗口长度或组合数量 |

额外说明：

- 会员面板、清分确认和返回主页确认已位于 Settings/Pause 父弹层内部，不需要新增独立暂停原因。
- `useUndoTool` 和 `triggerGameOver` 直接清除部分弹层标记后均会调用 `setScreen`，无需重复累计暂停区间。
- `consumeRevive` 两个成功分支均会 `closeRevivePrompt` 并 `setScreen('playing')`；它重置 comboState 已符合复活重置窗口的要求。可以保留本局 comboClock 的累计 offset。
- 以现有暂停标记作为生效点，不擅自把整个关闭动画时长重新定义为游戏暂停时长。
- 不要将 combo 是否还在 3 秒窗口加入 `hasActiveAnimation`，否则会引入多余持续绘制。

## 独立反例

`combo-clock-countercases.mjs`，最初三端 × 11 项为 33 项；最终又追加三端各 1 项短视口重叠测试，合计 36 项：

1. 暂停+后台，先关暂停再回前台。
2. 暂停+后台，先回前台再关暂停。
3. 设置+后台，先关设置再回前台。
4. 设置+后台，先回前台再关设置。
5. 纯后台与重复 hide/show。
6. 无 RAF、无 update 的前台 4001 ms idle，仍超时。
7. 扣除暂停后的 3000/3001 ms 精确边界。
8. 实际生成块放置产生撤销快照，长暂停后撤销，逻辑窗口仍正确。
9. 回首页并长期 idle 后新局，旧 Combo 不串入新局。
10. 状态边界防御：后台启动新局仍保留宿主暂停原因。
11. 用实际生成块与合法放置抵达无路可走/免死面板，完成复活，复活后窗口与后续暂停正确。
12. 用真实 Renderer 产生短视口/正常视口布局，将短视口、暂停面板、后台三种原因交叠；仅全部解除后恢复，之后 idle 仍过期。

清线计时单元使用真实 `handleLineClear(1)` 接收正常的已提交清线信号，未修改棋盘/分数来制造异常；放置、撤销和复活使用实际生成候选和拖放路径。后台/前台执行真实 Main 的对应方法，外围绘制、音频与视口被 stub；完整 Main 的 RAF/绘制保护另外由 `lifecycle-callbacks.mjs` 验证。

原 ZIP 的 JavaScript 初始 33 项对照结果：3 PASS / 30 FAIL。通过的是三端原本正确的前台 idle 超时对照；失败中包括尚不存在的新时钟 API/生命周期标记边界检查，不能把“30 个失败测试”当成 30 个产品缺陷。

主代理集成后的最终结果：**36 PASS / 0 FAIL**，日志 `final-combo.jsonl`。另重跑状态矩阵 24/24 与真实 Main 隐藏回调矩阵 6/6，未发现补丁引入的实际回归。
