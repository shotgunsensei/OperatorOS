# OperatorOS — Google Play Store Submission Guide

Complete guide to publishing OperatorOS to the Google Play Store.

---

## Prerequisites

### 1. Google Play Developer Account
- Sign up at [play.google.com/console](https://play.google.com/console)
- One-time registration fee: **$25 USD**
- Account review takes 2-7 days

### 2. Development Machine Requirements
- **Java JDK 17** (required by Android Gradle)
- **Android Studio** (latest stable) — [developer.android.com/studio](https://developer.android.com/studio)
- **Android SDK** (installed via Android Studio)
  - SDK Platform: API 34 (Android 14)
  - Build Tools: 34.0.0
- **Node.js 20+** and **pnpm** (already in this project)

### 3. Signing Key (Required for Play Store)
Generate a release signing key:
```bash
keytool -genkey -v \
  -keystore operatoros-release.keystore \
  -alias operatoros \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```
- Store the keystore file securely (NOT in git)
- Remember the passwords — you cannot recover them
- You will use this same key for all future updates

---

## Build Process

### Step 1: Build the Web App
From the project root:
```bash
cd apps/web
bash scripts/build-android.sh
```
This will:
1. Build a static export of the Next.js app
2. Inject the production API URL
3. Sync files to the Android project via Capacitor

### Step 2: Open in Android Studio
```bash
cd apps/web
npx cap open android
```
Or manually open `apps/web/android/` in Android Studio.

### Step 3: Configure Signing (First Time Only)
1. In Android Studio: **Build → Generate Signed Bundle / APK**
2. Choose **Android App Bundle (AAB)** (required by Play Store)
3. Select your keystore file
4. Enter key alias and passwords
5. Choose **release** build variant

Or configure signing in `apps/web/android/app/build.gradle`:
```groovy
android {
    signingConfigs {
        release {
            storeFile file('/path/to/operatoros-release.keystore')
            storePassword System.getenv('KEYSTORE_PASSWORD') ?: ''
            keyAlias 'operatoros'
            keyPassword System.getenv('KEY_PASSWORD') ?: ''
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

### Step 4: Build Release AAB
From command line:
```bash
cd apps/web/android
./gradlew bundleRelease
```
Output: `app/build/outputs/bundle/release/app-release.aab`

For a debug APK (testing only):
```bash
./gradlew assembleDebug
```
Output: `app/build/outputs/apk/debug/app-debug.apk`

---

## App Version Management

Update version for each release in `apps/web/android/app/build.gradle`:
```groovy
defaultConfig {
    versionCode 2       // Increment by 1 for each upload
    versionName "1.1"   // Human-readable version
}
```

**Important:** `versionCode` must increase with every Play Store upload. It can never go backwards.

---

## Play Store Listing Requirements

### App Information
| Field | Value | Notes |
|-------|-------|-------|
| **App name** | OperatorOS | Max 30 characters |
| **Short description** | AI-native cloud development environment | Max 80 characters |
| **Full description** | See below | Max 4000 characters |
| **Category** | Tools or Productivity | Choose one |
| **Content rating** | Complete the questionnaire | Usually rated "Everyone" |
| **Contact email** | Your developer email | Required |
| **Privacy policy URL** | Your privacy policy URL | **Required** |

### Suggested Full Description
```
OperatorOS is an AI-native Cloud Development Environment powered by Shotgun Ninjas.

Build, test, and deploy your projects from anywhere with a full-featured development workspace that includes:

• Workspace Management — Create and manage cloud workspaces backed by Git repositories
• Integrated File Explorer — Browse, read, and edit files in your project
• Built-in Terminal — Execute commands directly in your workspace
• AI Agent — An intelligent coding assistant that can read files, apply patches, run verification, and fix issues automatically
• Publish Assistant — Analyze your project, generate deployment artifacts, and deploy to Vercel, Render, Railway, Fly.io, or Docker
• Code Verification — Run automated build and test pipelines to ensure code quality

Supported Languages & Frameworks:
- TypeScript / JavaScript (Next.js, React, Express)
- Python (FastAPI, Flask)
- Go
- .NET / C#

OperatorOS gives you a professional development environment in your pocket.
```

### Required Graphics

| Asset | Size | Format | Notes |
|-------|------|--------|-------|
| **App Icon** | 512 x 512 px | PNG (32-bit, no alpha) | High-res icon for store listing |
| **Feature Graphic** | 1024 x 500 px | PNG or JPEG | Displayed at top of store listing |
| **Phone Screenshots** | Min 2, max 8 | 16:9 or 9:16 aspect ratio | Min width 320px, max 3840px |
| **Tablet Screenshots** | Optional but recommended | 16:9 or 9:16 | 7-inch and 10-inch tablets |

#### Screenshot Recommendations
Take screenshots of these key screens:
1. **Workspace list** — showing the sidebar with workspaces
2. **Code editor** — showing a file open with syntax highlighting
3. **Terminal** — showing command execution
4. **AI Agent** — showing the agent panel with a task running
5. **Publish Assistant** — showing the deployment wizard
6. **Detection results** — showing framework analysis

**Tool for screenshots:** Use Android Studio's emulator or a physical device with `adb shell screencap`.

### Creating the 512x512 App Icon
The Play Store requires a 512x512 PNG icon (not SVG). Convert your existing icon:
```bash
# Using ImageMagick (if installed):
convert -background "#0d1117" -density 300 \
  apps/web/public/icons/icon-512x512.svg \
  -resize 512x512 \
  play-store-icon.png

# Or use an online SVG-to-PNG converter at 512x512
```

### Creating the Feature Graphic
Create a 1024x500 image with:
- Dark background (#0d1117)
- "OperatorOS" logo/text
- Tagline: "AI-native Cloud Development"
- Branding: "Powered by Shotgun Ninjas"

Use Canva, Figma, or any image editor.

---

## Privacy Policy

A privacy policy is **required** by Google Play. It must cover:
- What data your app collects (workspace data, API interactions)
- How data is stored and processed
- Third-party services used (OpenAI API for the agent)
- User rights regarding their data
- Contact information

Host it on your website (e.g., `https://operator-os.replit.app/privacy`).

---

## Play Store Submission Steps

### 1. Create App in Play Console
1. Go to [play.google.com/console](https://play.google.com/console)
2. Click **"Create app"**
3. Fill in app name, language, app type (Application), free/paid
4. Accept developer policies

### 2. Complete Store Listing
1. **Main store listing** → Fill in descriptions, screenshots, icons
2. **Categorization** → Select category and tags
3. **Contact details** → Email, website, phone (optional)

### 3. Complete App Content
1. **Privacy policy** → Enter your privacy policy URL
2. **Ads** → Select "No" (unless you add ads)
3. **Content rating** → Complete the IARC questionnaire
4. **Target audience** → Select age groups (18+ recommended for dev tools)
5. **Data safety** → Declare what data your app collects/shares

#### Data Safety Declarations
For OperatorOS, you likely need to declare:
| Data Type | Collected | Shared | Purpose |
|-----------|-----------|--------|---------|
| App interactions | Yes | No | App functionality |
| Device or other IDs | Optional | No | Analytics |

### 4. Set Up Releases
1. Go to **Release → Production**
2. Click **"Create new release"**
3. Upload your `.aab` file
4. Add release notes
5. Review and roll out

### 5. Release Tracks
| Track | Purpose |
|-------|---------|
| **Internal testing** | Up to 100 testers, instant availability |
| **Closed testing** | Invite-only, up to 2000 testers |
| **Open testing** | Anyone can join via link |
| **Production** | Live on Play Store |

**Recommended flow:** Internal → Closed → Production

---

## Updating the App

For each update:
1. Increment `versionCode` in `build.gradle`
2. Run `bash scripts/build-android.sh`
3. Build signed AAB: `cd android && ./gradlew bundleRelease`
4. Upload to Play Console → Release → Production → Create new release

---

## Troubleshooting

### Build fails with "SDK not found"
Create `apps/web/android/local.properties`:
```
sdk.dir=/path/to/Android/sdk
```

### "App not installed" on device
- Ensure you're using a debug build for sideloading
- Enable "Install from unknown sources" in device settings
- Check minimum SDK version compatibility

### White screen on launch
- Verify the static export built correctly (`ls apps/web/out/index.html`)
- Check that `capacitor-config.js` was injected
- Run `npx cap sync android` after any web changes

### API calls fail in the app
- Ensure `NEXT_PUBLIC_API_URL` points to your deployed API
- The API server must have CORS enabled for the Capacitor origin
- Check that `__CAPACITOR_API_URL__` is set in `capacitor-config.js`

---

## File Structure Reference

```
apps/web/
├── android/                    # Android project (Capacitor-generated)
│   ├── app/
│   │   ├── build.gradle        # App-level build config (versions, signing)
│   │   └── src/main/
│   │       ├── AndroidManifest.xml
│   │       ├── assets/public/  # Web app files (synced by Capacitor)
│   │       └── res/            # Icons, splash, layouts
│   ├── build.gradle            # Project-level build config
│   └── gradle.properties       # SDK versions
├── capacitor.config.ts         # Capacitor configuration
├── out/                        # Static export (generated by build)
├── public/                     # Web public assets (icons, manifest)
├── scripts/
│   └── build-android.sh        # Build automation script
└── src/                        # Next.js source code
```

---

## Estimated Timeline

| Step | Duration |
|------|----------|
| Developer account registration | 2-7 days |
| Prepare store listing assets | 1-2 hours |
| First build and test | 30 minutes |
| Play Console setup | 1-2 hours |
| Internal testing | 1-3 days |
| Review by Google | 1-7 days |
| **Total to first publish** | **~1-2 weeks** |
