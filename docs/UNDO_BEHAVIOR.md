# 撤回行为说明

日期：2026-06-16  
范围：微信小程序版本与 Android APK 版本

## 1. 目标行为

撤回只回滚最近一次成功放置前的业务状态，不能回滚到正在拖动中的临时输入状态。

成功撤回后：

- 棋盘恢复到放置前。
- 当前分数恢复到放置前。
- 候选方块恢复到放置前，包含每个方块的 `used` 状态。
- 待清除状态、放置脉冲、组合状态、复活次数、最高分资格按快照恢复。
- 撤回次数扣减 1 次。
- 同一个快照只能使用一次。
- 拖动状态、预览状态、输入锁和反馈状态被清理。
- 页面保持在 `playing`。

撤回不做的事：

- 不回滚已经写入的历史最高分。
- 不恢复触摸按住时的临时拖动状态。
- 不恢复无效放置产生的错误反馈。
- 不允许复活后再使用复活前的旧快照。

## 2. 根因

两版旧逻辑在 `GameState.useUndoTool()` 中存在同一个问题：

1. 先执行 `this.toolUsage.undo += 1`。
2. 随后又执行 `this.toolUsage = { ...snapshot.toolUsage }`。
3. `syncRoundRuntimeState()` 再根据恢复后的旧 `toolUsage` 计算剩余次数。

结果是撤回动作本身的使用次数被快照覆盖，玩家成功撤回后仍显示还有 1 次撤回。

同时，旧快照保存并恢复 `dragState`、`previewState` 和 `inputLocked`。如果快照创建于拖动放置流程中，撤回后可能把已经结束的拖动状态带回当前局。

复活流程旧逻辑没有主动清除 `undoSnapshot`，可能让复活后的局面仍保留复活前的旧撤回入口。

## 3. 修改位置

微信小程序：

- `we xin xiao cheng xu/js/game/GameState.js`
  - `useUndoTool()`
  - `createUndoSnapshot()`
  - `consumeRevive()`

Android APK：

- `we xin xiao cheng xu-android-apk/app/src/main/assets/js/game/GameState.js`
  - `useUndoTool()`
  - `createUndoSnapshot()`
  - `consumeRevive()`

## 4. 测试覆盖

自动测试文件：

- `tests/parity/game-state.test.mjs`

覆盖内容：

- 成功撤回恢复棋盘、候选、分数和业务状态。
- 成功撤回扣减撤回次数。
- 同一撤回快照不可重复使用。
- 撤回后拖动状态、预览状态、输入锁和反馈状态被清理。
- 快照对棋盘和候选方块做深拷贝，放置后的外部修改不会污染撤回结果。
- 无效放置不会覆盖上一条有效撤回快照。
- 复活成功后清除旧撤回快照，不能撤回到复活前死局。

## 5. 未改变的行为

- 棋盘尺寸未改变。
- 方块定义与生成概率未改变。
- 计分公式未改变。
- 清除、刷新、复活次数规则未改变。
- 存档键和字段未改变。
- 管理员成绩隔离规则未改变。
- 音效、震动、Renderer 和页面布局未改变。
