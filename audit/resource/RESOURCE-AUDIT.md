# Resource Auditor 独立终审

审计日期：2026-10-10。参考原始源码交接 ZIP：`relax-block-puzzle-cloud-handoff-20261009-4d1c308.zip`，参考提交 `4d1c30889c95b4458bb16c2704efba885553316a`。

## 1. 范围与结论

本代理只读审查产品文件，所有探针、临时镜像和报告均写入独立审计目录。已阅读根目录和两平台 `AGENTS.md`、`CLOUD-HANDOFF.md`、统一规格的音频/生命周期约定、平台 manifest、资源映射、三端 `SoundManager`、Web/Android shim、三端 Canvas/Renderer/Main 以及 Android `MainActivity.kt`。

主代理的静音、微信后台、BGM 同步补丁，经原始 ZIP 对照与独立探针确认修复了可重现的问题。终审另外发现并向主代理提交了“初始隐藏页面未初始化后台状态”和“音频恢复命令重复执行产生嵌套目录”两个边界；主代理已完成必要修复，前者已由本代理独立复测。未发现有证据支持新增的大规模资源重构、音频降质或缓存策略调整。

以下编号仅是资源子报告局部编号，由总报告去重、统一分级。没有资源范围的 P0/P1 结论。

## 2. 资源逐文件保真

| 平台 | 映射音频数 | 实际字节数 | 预算约束 | 核验结果 |
| --- | ---: | ---: | --- | --- |
| 微信 | 11 | 2,931,409 | ≤ 4,500,000 | 完全满足；11 个 SHA-256 均与原始 ZIP 一致 |
| Web | 11 | 26,936,009 | ≥ 25,000,000 | 完全满足；11 个 SHA-256 均与原始 ZIP 一致 |
| Android 已恢复镜像 | 11 | 26,936,009 | ≥ 25,000,000 | 11 文件名、大小、SHA-256 全部与 Web 一致 |

依据：`resource-recovery-results.json` 包含各文件完整 SHA-256；`verify-resource-recovery.py` 独立读取原始 ZIP、资源映射及当前三端文件，并按递归清单校验，不只比较目录总字节数。没有多余音频文件或缺少映射文件。

另用环境已有 `ffprobe` 检查了微信和 Web 共 22 个不同编码文件，均识别为 MP3 且时长大于 0，见 `audio-codec-results.json`。这是编码元数据检查，未替代原生播放器的听音与兼容性验收。

## 3. 已证实的缺陷与修复复核

### RES-01 · P2 · 静音设置未立即停止已在播放的效果音

- **平台与路径：** Web、Android WebView、微信三端；效果音尚未结束时，在设置中关闭声音。
- **影响：** 开关关闭后，已有声音仍继续，直到资源自行结束。BGM 是独立设置，不属于本问题的静音范围。
- **原始根因：** `SoundManager.setSettings` 只更新布尔值，`playEffect` 会阻止新声音，但没有停止已有 context。
- **位置：** 三端 `js/game/SoundManager.js` 的 `setSettings`，修复后第 46/58 行；`stopAllEffects` 第 223 行。
- **最小修复：** 检测 `soundEnabled: true → false`，立即调用现有/新增的 `stopAllEffects`，保持 BGM 的独立开关语义。
- **独立反证：** 从原始 ZIP 取出的三端原始类都观测到 `effectContinuesOnMute=true`；当前类都为 `false`。重新开启声音没有重播旧效果音。
- **置信度：** 高，实际产品类的 API 状态和调用顺序可确定复现；设备实际听音仍列人工验收项。

### RES-02 · P2 · 微信后台未停止效果音，且仍接受新效果音

- **平台与路径：** 微信；先播放清除音效，再触发 `handleAppHide`；或隐藏后调用正常效果音消费者。
- **影响：** 后台会保留效果音，并可能接受晚到事件产生的新声音。
- **另外两端：** 原始 Web 和 Android 的 `handleAppHide` 已停止所有效果音，`playEffect` 已检查 `appHidden`，此次无需改变既有后台策略。
- **原始根因：** 微信仅停止 BGM；其效果音入口只检查 `soundEnabled`。
- **位置：** `we xin xiao cheng xu/js/game/SoundManager.js:161`、`:223`、`:253`。
- **最小修复：** `playEffect` 加入现有 `appHidden` 门禁；隐藏时调用 `stopAllEffects` 后停止 BGM。回前台仍仅恢复已开启的 BGM。
- **独立反证：** 原始微信类的 `effectContinuesOnHide`、`newEffectPlayedHidden` 均为 `true`；当前三端均为 `false`。前台恢复没有增加效果音播放次数。
- **置信度：** 高，接口级确定复现；微信真机音频后端未在此环境执行。

### RES-03 · P3 · 微信修改无关设置时将 BGM 重置到开头

- **平台与路径：** 微信；BGM 开启并保持同一曲目，改变振动等其他设置。
- **影响：** 一次与音乐无关的设置操作造成音乐位置跳回开头。
- **另外两端：** Web/Android 原始版本已直接 `play`，没有相同的 stop/seek 重置。
- **原始根因：** `setSettings → syncBgm → playBgm` 对同一 context 无条件先 `stop`、`seek(0)`。
- **位置：** `we xin xiao cheng xu/js/game/SoundManager.js:194` 的 `playBgm`。
- **最小修复：** 保留播放/用户手势恢复路径，删除普通同步中的 stop/seek。真正换曲仍先销毁旧 context；真正进入后台仍执行 stop，因此前台从曲目开头恢复的既有约定保持。
- **独立反证：** 原始微信类仅改变振动便各多出 1 次 BGM stop 和 seek；当前类两项均为 0，未创建第二个 BGM context。
- **置信度：** 高，重置指令明确；原生设备位置听音验收待执行。

以上三项对照数据均在 `audio-before-after.json`；原始类直接取自上传 ZIP，并非由当前源码逆向改写而成。

### RES-04 · P2 · 初始已隐藏的浏览器页面未进入后台门禁

- **平台与路径：** Web 及 Android 的 WebView JS 适配层；源码开始运行时 `document.hidden=true`，且已保存 `bgmEnabled=true`。微信不经过该 DOM 初始化路径。
- **影响：** 原始 Main 仍标记为前台，设置加载会尝试播放 BGM，并安排一帧；已经隐藏的状态直到后续有效生命周期变更前都没有同步给游戏和音频。
- **原始根因：** shim 注册时保存 `visible = !document.hidden`，以后注册的 `wx.onHide` 订阅者没有当前状态回放；Main 则始终初始化 `isPaused=false`。再次发出仍为 hidden 的通知也会被 shim 正常去重。
- **位置：** Web `browser-wx-shim.js:151–162` 的当前状态去重；Web/Android `js/main.js:21–31` 的生命周期及 SoundManager 初始化。
- **最小修复：** Web/Android Main 从当前 `document.hidden` 初始化 `isPaused`，同步 GameState 的生命周期，并在应用音频设置之前使 SoundManager 进入隐藏状态。无需修改微信生命周期接口或禁用正常去重。
- **修复前独立观察：** 两适配层均为 `mainPaused=false`、`soundManagerHidden=false`、`bgmPlayCalls=1`、`scheduledFrames=1`；补发仍 hidden 的通知后依然有一个播放中对象。
- **修复后独立观察：** 两适配层均为 `mainPaused=true`、`soundManagerHidden=true`、`bgmPlayCalls=0`、`scheduledFrames=0`；回前台后正常恢复，BGM 换曲/销毁探针全部通过。
- **证据：** `lifecycle-resource-before-initial-hidden-fix.json`、`lifecycle-resource-results.json`、`lifecycle-resource-probes.mjs`。
- **置信度与边界：** 受控初始浏览器状态下，实际产品 shim/Main 的问题与修复均为高置信度。环境现有 Chromium 141 headless shell 的普通页、background target 及 frozen target 都仍报告 `document.hidden=false`，所以未声称完成自然后台标签页重现；Android 冷启动时 WebView 如何暴露该状态仍需真机验证。这里的浏览器播放计数也不等于绕过浏览器自动播放策略的听音结果。

### RES-05 · P3 · 交接说明的旧恢复命令不支持安全重复执行

- **平台与路径：** 交接包恢复 Android 音频；连续执行原 `CLOUD-HANDOFF.md §5` 的 `cp -r docs/audio assets/audio`。
- **影响：** 第二次执行把源目录放进已存在的目标目录，产生 `assets/audio/audio/*`。11 个文件变成 22 个、26,936,009 字节变成 53,872,018 字节，出现非映射资源，也会不必要地增大构建资源。
- **另外两端：** Web 保留源和微信轻量资源都未被该命令修改。
- **根因：** `cp -r` 对不存在目标与已存在目标的目录语义不同。此问题不是原交接包省略镜像本身的产品缺陷。
- **独立最小复现：** 在临时目录中用实际保留的全部 Web 音频执行旧命令两次，确认嵌套目录及精确字节数，随后销毁临时目录；未污染产品资源目录。
- **最小修复：** 主代理新增 `scripts/restore-android-audio.mjs`，以 `node scripts/restore-android-audio.mjs` 恢复映射文件。
- **新脚本只读复核：** 第 10–13 行约束映射路径；第 15–28 行拒绝非映射条目并检查保留源完整性；第 32–34 行在写入前检查两目录；第 37–42 行逐文件复制并读回 SHA-256。脚本不通过删除异常条目来掩盖问题，重复执行不产生目录嵌套。源不完整时拒绝执行；一次复制中断后可以重跑。
- **验证边界：** 主代理已执行新脚本两次成功，见总审计 `final/audio-restore-first.log` 和 `final/audio-restore-second.log`。本代理另以正确的内容复制方式两次恢复全部 11 文件，独立比对保留源的全部 SHA-256，结果见 `resource-recovery-results.json`。最终 ZIP 的全新解包/新脚本恢复/资源验证由总交付验证继续负责。
- **置信度：** 高，文件系统实际复现与完整哈希对照。

## 4. 资源生命周期反证与界限

| 检查 | 独立结果 | 能够支持的结论 |
| --- | --- | --- |
| 三端音频各 200 次隐藏、换曲、显示、振动设置、静音/取消静音 | 全部断言通过；最大 7 个效果音 context + 1 个 BGM；旧 BGM 每次正确 destroy；结束隐藏时 0 个播放中 context | 这些调用路径没有随轮数增长的存活音频池，隐藏和静音不会重播旧效果音 |
| Web/Android 实际 shim 中各 200 次 BGM 替换 | 循环重试集合始终只有 1 个；最终 destroy 后集合为 0、所有已创建 HTMLAudio mock 的 src 均释放 | 销毁时从强引用重试集合移除，并释放旧音频来源 |
| 三端 Renderer 各 1,000 次 viewport 变化、背景/棋盘缓存创建与复用 | 微信最多 750,000 像素；Web/Android 最多 1,249,524 像素；分别在 750,000 / 1,250,000 上限内；clear 后均为 0 | 同 key 复用，失效/resize 释放旧 bitmap，缓存像素记账与实际存活 surface 一致 |
| 主 Canvas DPR 预算源码 | `getCanvasPixelRatio` 从总预算扣除缓存预算；微信总预算 4,000,000、full 总预算 5,000,000 | 主 Canvas 与离屏缓存共用有界预算；未增加画质或内存上限 |
| 输入、Resize、页面隐藏/显示 | 复核 Main 单一 bitmap 大小控制器、幂等暂停、取消 RAF、取消拖拽及回前台完整请求 | 修复没有引入固定后台/空闲绘制循环 |

计数探针直接调用效果音键以覆盖所有可创建对象，因此会包含 `pickup` 池容量。**Web/Android 公共 `playPickup()` 保持原有 no-op；微信仍播放 pickup。** 不以“跨端一致”为理由改变这项保留行为。七个固定效果音对象用于重复使用，不按每次播放新建；暂时隐藏不必销毁这些固定对象。

Canvas 离屏缓存的异常分支仍可退回直接绘制；背景与棋盘的缓存销毁会将宽高归零再移除 Map 引用。上述压力验证衡量的是可见对象数、bitmap 像素与 API 释放指令，不是操作系统/GPU/native heap 的内存曲线。

本代理没有改动共享游戏逻辑、音频二进制、质量配置、工具链、Android 签名或发布产物，也没有运行推送/PR/部署。原交接包省略镜像导致的三项测试失败应与资源恢复流程问题区分；总审计恢复镜像后的基线测试已经通过。另两项 `spawnSync EBUSY` 是总审计已重验通过的环境问题，未列资源产品缺陷。

## 5. 待设备验证，不列为已证实缺陷

| 待验证项 | 当前证据边界 |
| --- | --- |
| 微信真实 hide/show、系统来电/锁屏后的音频停止及恢复 | 已验证 SoundManager 调用顺序、门禁与固定 context 复用；没有微信开发者工具或真实音频后端 |
| Android Activity 冷启动在后台、重建与反复退出后的资源归还 | 已复核 Kotlin pause/resumeTimers 与 JS bridge，已有进程级计时器所有权；没有 SDK/adb/设备 heap 与 Logcat 证据 |
| 自然后台浏览器标签页初始化 | 受控 `document.hidden=true` 的真实产品 JS 验证已闭合；当前 headless shell 不提供自然隐藏标签页状态 |
| 系统低内存造成的原生 Canvas2D context 丢失/恢复 | 已覆盖正常 resize/DPR/显示恢复与离屏缓存释放；未执行真实原生 context 丢失事件注入或 GPU 资源回收 |
| 实际听音和编码在微信/Android 多版本兼容性 | 文件全部保真，22 个保留音频均通过 MP3 元数据探针；未以此替代听音/设备验收 |

最终源码 ZIP 的严格 `< 50,000,000` 字节验收与其 SHA-256 以总交付报告实测为准。本子报告确认：允许省略 Android 的 26,936,009 字节完整音频镜像，因保留源与全部 11 个映射文件均已获得完整哈希等价证明，且已有幂等恢复实现。

## 6. 独立证据文件

- `RESOURCE-AUDIT.md`：本报告。
- `verify-resource-recovery.py`、`resource-recovery-results.json`：原 ZIP 对照、三端资源逐文件清单/哈希、旧恢复命令复现及正确重复复制验证。
- `audio-before-after.json`：直接比较原始 ZIP 与修复后 SoundManager 的效果音/后台/BGM 重置行为。
- `audio-codec-results.json`：22 个保留 MP3 文件的 ffprobe 元数据结果。
- `lifecycle-resource-probes.mjs`：实际产品音频/Renderer/shim/Main 的独立探针。
- `lifecycle-resource-before-initial-hidden-fix.json`、`lifecycle-resource-results.json`：初始隐藏缺陷修前与修后，以及音频池/Canvas 缓存压力验证。
