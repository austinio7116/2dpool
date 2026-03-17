# Android App Plan — 2D Pool

## Approach: WebView Wrapper via Capacitor

The fastest, lowest-risk path to the Play Store is wrapping the existing web app in a native Android WebView using **Capacitor** (by Ionic). This preserves 100% of the existing game code while giving native app packaging, offline support, and Play Store distribution.

**Why Capacitor over alternatives:**
- Cordova: legacy, declining ecosystem
- React Native / Flutter: would require a full rewrite
- TWA (Trusted Web Activity): limited native API access, requires hosted URL
- Raw WebView: works but you'd reimplement what Capacitor gives for free

---

## Phase 1: Project Setup & Capacitor Integration

### 1.1 Install Capacitor
```
npm init -y
npm install @capacitor/core @capacitor/cli
npx cap init "2D Pool" com.yourname.pool2d --web-dir .
npx cap add android
```

### 1.2 Bundle Planck.js Locally
- Currently loaded from CDN (`esm.sh/planck-js@1.0.6`)
- **Must be bundled locally** — the app needs to work offline
- Options:
  - Download the ESM bundle and serve from `lib/planck.js`
  - Or use a simple bundler (esbuild) to create a single-file build
- Update the import map in `index.html` to point to local path

### 1.3 Remove CDN Dependencies
- Audit all `fetch()` calls and external URLs
- Ensure all assets (images, sounds, fonts) are local
- The app must be fully self-contained

**Deliverable:** App builds and runs in Android emulator with all game features working.

---

## Phase 2: Offline & Storage

### 2.1 localStorage → Capacitor Preferences (or keep localStorage)
- WebView localStorage works fine for most cases
- **Risk:** On some Android versions, WebView data can be cleared by the OS
- **Option A (simple):** Keep localStorage as-is — works in WebView
- **Option B (robust):** Migrate to `@capacitor/preferences` (native key-value store)
  - Career progress, custom ball sets/tables, settings
  - More reliable persistence across app updates

### 2.2 Offline Support
- Since everything is bundled locally, the app is offline by default
- No service worker needed — Capacitor serves files from the APK

**Deliverable:** Game data persists reliably across app restarts and updates.

---

## Phase 3: Android-Specific Adaptations

### 3.1 Screen & Display
- Lock orientation to landscape via `AndroidManifest.xml`:
  ```xml
  android:screenOrientation="landscape"
  ```
- Handle notch/cutout areas (safe area insets) — already partially handled via `viewport-fit=cover`
- Fullscreen immersive mode (hide status bar + nav bar):
  ```xml
  <style name="AppTheme">
    <item name="android:windowFullscreen">true</item>
  </style>
  ```
- Handle different aspect ratios (16:9, 18:9, 20:9, foldables)

### 3.2 Back Button Handling
- Android hardware/gesture back button must be handled
- Map to: close modal → exit to menu → confirm exit app
- Use Capacitor's `@capacitor/app` plugin:
  ```js
  import { App } from '@capacitor/app'
  App.addListener('backButton', ({ canGoBack }) => { ... })
  ```

### 3.3 Audio Fixes
- WebView AudioContext may need unlocking on app resume
- Handle app backgrounding: pause audio when app goes to background
- Use `@capacitor/app` lifecycle events:
  ```js
  App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) audio.suspend()
    else audio.resume()
  })
  ```

### 3.4 Performance
- Enable hardware acceleration in WebView
- Set `android:hardwareAccelerated="true"` in manifest
- Canvas rendering should perform well — test on low-end devices
- Consider reducing table texture sizes (currently 5-8MB each PNG)
  - Compress to WebP or lower resolution for mobile
  - Total assets could exceed 100MB — Play Store limit is 150MB for AAB

### 3.5 Touch Input
- Already well-supported (`passive: false`, multi-touch)
- Test and verify all touch interactions work in WebView
- May need to disable WebView's default touch behaviors (long-press menu, text selection)

**Deliverable:** App feels native — proper back button, immersive fullscreen, audio lifecycle.

---

## Phase 4: App Store Requirements

### 4.1 App Identity
- **Package name:** `com.yourname.pool2d` (cannot change after publish)
- **App name:** "2D Pool" (or something more marketable)
- **Version code/name:** Set in `build.gradle`

### 4.2 App Icon & Splash Screen
- **Adaptive icon** required (foreground + background layers)
  - 108x108dp (432x432px at xxxhdpi)
  - Currently only has an SVG "8" badge in manifest
  - Need proper icon design in multiple densities
- **Splash screen:** Use `@capacitor/splash-screen` plugin
  - Show splash while WebView initializes
  - Replaces the current `#loading-screen` div

### 4.3 Signing
- Generate a keystore:
  ```
  keytool -genkey -v -keystore pool2d.keystore -alias pool2d -keyalg RSA -keysize 2048 -validity 10000
  ```
- Configure signing in `android/app/build.gradle`
- **Keep the keystore safe** — losing it means you can never update the app

### 4.4 Build AAB (Android App Bundle)
```
npx cap sync android
cd android && ./gradlew bundleRelease
```
- Output: `android/app/build/outputs/bundle/release/app-release.aab`

### 4.5 Asset Size Optimization
Current asset sizes are large:
- 11 table PNGs at 5-8MB each (~70MB total)
- 8 colorized tables at 3-6MB each (~35MB total)
- **Total could exceed 100MB**

Actions needed:
- Convert PNGs to WebP (50-70% size reduction)
- Reduce resolution for mobile (table textures don't need 4K on a phone)
- Consider loading non-default tables on-demand or as expansion packs
- Target: **under 100MB** total APK/AAB size

**Deliverable:** Signed AAB ready for Play Store upload.

---

## Phase 5: Play Store Listing

### 5.1 Google Play Developer Account
- One-time $25 registration fee
- Account approval can take 48+ hours

### 5.2 Store Listing Assets
- **Screenshots:** Min 2, recommended 8 (phone + tablet)
  - Phone: 1080x1920 or 1920x1080
  - 7" tablet: 1200x1920
  - 10" tablet: 1600x2560
- **Feature graphic:** 1024x500px
- **Short description:** 80 chars max
- **Full description:** 4000 chars max
- **Privacy policy URL** (required for apps with data storage)

### 5.3 Content Rating
- Complete the IARC rating questionnaire
- Pool/billiards game = likely Everyone (E) rating
- No violence, no user-generated content shared online, no IAP currently

### 5.4 App Review
- First submission review takes 3-7 days
- Subsequent updates: 1-3 days
- Common rejection reasons to avoid:
  - Missing privacy policy
  - App crashes on launch
  - Misleading metadata
  - WebView app with no added value (add native features to differentiate)

**Deliverable:** App live on Google Play Store.

---

## Phase 6: Post-Launch Enhancements (Optional)

### 6.1 Native Features to Add Value
- **Haptic feedback** on ball collisions (`@capacitor/haptics`)
- **Share scores** via native share sheet (`@capacitor/share`)
- **Rate app** prompt after N games
- **Push notifications** for daily challenges (future)

### 6.2 Monetization Options
- Google AdMob (banner or interstitial between games)
- In-app purchases for premium ball sets / table designs
- One-time paid app ($1-3)

### 6.3 Analytics
- Firebase Analytics (free, integrates with Play Console)
- Track: games played, modes used, session length, career progress

---

## Task Checklist

| # | Task | Effort |
|---|------|--------|
| 1 | Initialize npm + install Capacitor | 1 hour |
| 2 | Bundle Planck.js locally | 1-2 hours |
| 3 | Add Android platform, verify build | 1-2 hours |
| 4 | Test all game features in Android emulator | 2-3 hours |
| 5 | Optimize asset sizes (PNG→WebP, resize) | 3-4 hours |
| 6 | Android back button + lifecycle handling | 2-3 hours |
| 7 | Fullscreen immersive mode + notch handling | 1-2 hours |
| 8 | Audio lifecycle (pause/resume) | 1-2 hours |
| 9 | Design app icon (adaptive) + splash screen | 2-4 hours |
| 10 | Configure signing + build release AAB | 1-2 hours |
| 11 | Create Play Store listing assets | 3-4 hours |
| 12 | Set up Google Play developer account | 1 hour |
| 13 | Submit for review | 1 hour |
| 14 | Post-launch: haptics, share, analytics | 4-6 hours |

**Total estimated effort: ~25-35 hours**

---

## Key Risks

| Risk | Mitigation |
|------|------------|
| WebView performance on low-end devices | Profile early, optimize textures, reduce physics substeps if needed |
| APK size too large (>150MB) | Compress textures aggressively, lazy-load non-default tables |
| WebView audio quirks | Test across Android versions (10-14), handle AudioContext resume |
| Play Store rejection as "WebView-only" | Add native touches: haptics, splash screen, back button, share |
| localStorage data loss on update | Consider migrating to Capacitor Preferences for critical data |

---

## Recommended Tech Stack

```
Existing Web App (HTML/CSS/JS)
    ↓
Capacitor 6.x (native bridge)
    ↓
Android Studio + Gradle (build)
    ↓
Google Play Console (distribution)
```

**No rewrite required.** The existing codebase works as-is with minimal adaptation.
