<h1 align="center">🧩 Relax Block Puzzle</h1>

<p align="center">
  <strong>Make room for one more move.</strong>
</p>

<p align="center">
  A relaxed block-placement puzzle with a simple rule and a growing challenge:<br>
  fit the pieces, complete the lines, and keep your 10 × 10 board alive.
</p>

<p align="center">
  <a href="https://seiya058904.github.io/Relax-Block-Puzzle/"><strong>▶ Play in Browser</strong></a>
  &nbsp;·&nbsp;
  <a href="#play-and-download">📱 Platforms & Downloads</a>
  &nbsp;·&nbsp;
  <a href="#how-to-play">🎮 How to Play</a>
  &nbsp;·&nbsp;
  <a href="#for-developers">⚙️ For Developers</a>
</p>

<p align="center">
  <sub>10 × 10 BOARD &nbsp;·&nbsp; THREE DIFFICULTIES &nbsp;·&nbsp; THREE PLATFORMS &nbsp;·&nbsp; ONE SHARED RULESET</sub>
</p>

---

> **Easy to understand. Harder to put down.**
>
> There is no falling-block timer to chase. Choose where each shape belongs, clear full rows or columns, and think ahead before your board runs out of room.

<a id="play-and-download"></a>
## 🎮 Play & Download

The same core puzzle runs in three environments, with platform-specific controls, rendering, audio, and lifecycle behavior.

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>🌐 Web — Play Now</h3>
      <p><sub>BROWSER · GITHUB PAGES</sub></p>
      <p>Open the browser version without installing an app. Mouse and touch interactions use the Web platform adapter.</p>
      <p><strong><a href="https://seiya058904.github.io/Relax-Block-Puzzle/">▶ Launch the Web Game →</a></strong></p>
    </td>
    <td width="50%" valign="top">
      <h3>📱 Android — Debug Preview</h3>
      <p><sub>OFFLINE WEBVIEW · VERSION 1.0.12</sub></p>
      <p>Play the locally packaged game in a Kotlin/WebView shell. The available installable APK is a <strong>debug-signed preview</strong>, not a production-signed release.</p>
      <p><strong><a href="https://github.com/seiya058904/Relax-Block-Puzzle/releases/tag/v1.0.12">View Android v1.0.12 →</a></strong></p>
    </td>
  </tr>
  <tr>
    <td colspan="2" valign="top">
      <h3>💬 WeChat Mini Game — Source & Preview</h3>
      <p><sub>WECHAT DEVELOPER TOOLS · NATIVE PLATFORM ADAPTER</sub></p>
      <p>The WeChat edition is maintained as a Mini Game project, with its own Canvas, touch, audio, storage, and lifecycle integrations. Open the source in WeChat Developer Tools for compilation and preview; this is <strong>not</strong> a claim of an independently published Mini Game.</p>
      <p><strong><a href="we%20xin%20xiao%20cheng%20xu/">Explore WeChat Source →</a></strong></p>
    </td>
  </tr>
</table>

> [!WARNING]
> **Android download distinction:** The `v1.0.12` **Release APK is unsigned and cannot be installed as downloaded**. For testing, choose the separately named **Debug preview APK** on the [release page](https://github.com/seiya058904/Relax-Block-Puzzle/releases/tag/v1.0.12). Each attachment includes its own SHA-256 checksum file. Debug signing does not make it a production release.

<a id="how-to-play"></a>
## 🕹️ How to Play

<p align="center"><code>PLACE A SHAPE &nbsp;→&nbsp; COMPLETE A LINE &nbsp;→&nbsp; CLEAR SPACE &nbsp;→&nbsp; KEEP GOING</code></p>

1. **Choose a difficulty.** Play on Easy, Normal, or Master, each with its own local best score.
2. **Place a piece.** Drag one of the three available shapes onto the **10 × 10 grid**. Pieces must fit entirely within empty cells.
3. **Clear the board.** Fill a complete row or column to remove it and make space for future shapes. Multiple completed lines can clear together.
4. **Plan the next set.** After using all three pieces, receive another set and continue for as long as you can make a legal move.

### ✨ Small Rules, More Possibilities

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>🧠 Space Is Your Strategy</h3>
      <p>Every placement changes what can fit next. Keep options open, plan around awkward shapes, and decide when to clear a line.</p>
    </td>
    <td width="50%" valign="top">
      <h3>⚡ Lines & Combos</h3>
      <p>Complete rows and columns together, build successive clears, and watch scoring and feedback respond to your choices.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>🧰 A Few Helpful Tools</h3>
      <p>Refresh the candidate pieces, clear a small area, or undo a placement. Tool availability depends on the chosen difficulty.</p>
    </td>
    <td width="50%" valign="top">
      <h3>🎵 Built for Short Sessions</h3>
      <p>Responsive dragging, light effects, music, sound, vibration settings, and persistent local records make each session easy to revisit.</p>
    </td>
  </tr>
</table>

## 🔀 One Game, Three Platform Experiences

The gameplay is shared, but the application is **not three identical copies of the same interface**. Each host keeps the integrations it needs.

| Platform | Experience | Maintained source |
| --- | --- | --- |
| **Web** | Browser Canvas and input, deployed as static GitHub Pages files | [`docs/` Web build](we%20xin%20xiao%20cheng%20xu-android-apk/docs/) |
| **WeChat** | Mini Game APIs, platform-specific rendering, lifecycle, and lightweight audio | [WeChat project](we%20xin%20xiao%20cheng%20xu/) |
| **Android** | Kotlin/WebView container with bundled offline assets and native lifecycle integration | [Android project](we%20xin%20xiao%20cheng%20xu-android-apk/) |

**Shared rules originate in [`shared/js/`](shared/js/).** The [platform manifest](config/platform-manifest.json) defines generated modules and their destinations. Platform-specific input, rendering, audio, and storage adapters remain independent.

> [!NOTE]
> Browser and Android emulator checks do not substitute for testing real phone touch, vibration, sound, safe areas, or the native WeChat runtime. The [v1.0.12 validation baseline](docs/TEST_BASELINE.md) explains which environments were actually tested.

<a id="for-developers"></a>
## ⚙️ For Developers

The game uses **JavaScript ES modules** for gameplay and **Kotlin/Gradle** for its Android host. Repository-level checks use Node.js's built-in test runner; the three platform versions are kept aligned through explicit synchronization and parity checks.

<details>
<summary><strong>🛠️ Expand development commands and verification</strong></summary>

### Shared logic and verification

From the repository root:

```powershell
npm test                 # Gameplay and platform regressions
npm run verify           # Check generated shared files and platform parity
npm run verify:assets    # Resource mappings and platform budgets
```

When intentionally changing shared gameplay modules, edit [`shared/js/`](shared/js/) first, then run `npm run sync` and the relevant verification checks. **Do not hand-edit generated platform copies.**

`npm run verify:apk-assets` additionally inspects a **freshly built Debug APK**; it is not a general-purpose test that should be run before an APK exists.

### Android Debug build

With **JDK 17** and the Android SDK configured locally, run:

```powershell
cd "we xin xiao cheng xu-android-apk"
.\gradlew.bat assembleDebug --no-daemon
```

The Debug APK is generated under `app/build/outputs/apk/debug/`. Android uses `versionName 1.0.12` / `versionCode 12` for the referenced release. The signed production-release workflow is separate and is not represented by the Debug build.

### WeChat preview

Open [`we xin xiao cheng xu/`](we%20xin%20xiao%20cheng%20xu/) with **WeChat Developer Tools**. Compile and preview there, then verify native input, audio, vibration, persistence, and hide/show behavior on an actual device when those areas change.

### Project map

```text
shared/js/                               Canonical shared gameplay modules
config/platform-manifest.json            Shared/generated/platform-specific mapping
we xin xiao cheng xu/                    WeChat Mini Game source
we xin xiao cheng xu-android-apk/docs/   Published browser version
we xin xiao cheng xu-android-apk/app/    Android WebView host and bundled assets
tests/                                  Node.js regression and parity coverage
scripts/                                Synchronization and verification tools
docs/                                   Specifications, audits, and test boundaries
```

</details>

## 📚 Documentation & Project Rules

- **[Unified product specification](docs/UNIFIED_SPEC.md)** — board behavior, scoring, difficulty, power-ups, and cross-platform contracts.
- **[Platform synchronization](docs/PLATFORM_SYNC.md)** — which modules are authoritative, generated, or platform-specific.
- **[Parity audit](docs/PARITY_AUDIT.md)** — documented platform differences and their history.
- **[Validation baseline](docs/TEST_BASELINE.md)** — automated coverage, emulator results, and checks that still require physical devices.
- **[Android project guide](we%20xin%20xiao%20cheng%20xu-android-apk/README.md)** — installation notes, Android-specific behavior, and release history.
- **[Repository guidance](AGENTS.md)** — development boundaries, safety, and release rules.

The repository has no root-level `LICENSE` file granting blanket reuse rights. Keep original artwork, attribution, third-party resources, and platform-specific configuration within their existing permissions. Do not commit credentials, signing keys, APK outputs, or local build artifacts.

---

<p align="center">
  <sub>ONE BOARD. THREE WAYS TO PLAY.</sub><br>
  <sub>Place thoughtfully. Clear the lines. Enjoy the next move.</sub>
</p>
