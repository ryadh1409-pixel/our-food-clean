# TestFlight build – what was done and what to run

## Done automatically

1. **app.json**
   - `version`: `1.0.0` → `1.0.1`
   - `name`: `HalfOrder`
   - `ios.bundleIdentifier`: `com.halforder.app`
   - `ios.buildNumber`: `2` (EAS may auto-increment when using remote version source)
   - Slug left as `ourfood-clean` so it matches the existing EAS project (projectId in `extra.eas`).

2. **eas.json**
   - Production profile kept with `autoIncrement: true`.
   - iOS production builds default to App Store; no `buildType` needed (and it was rejected by the current EAS schema).

3. **Dependencies and doctor**
   - `npm install`, `npx expo install`, and `npx expo-doctor` run; all 17 checks pass.
   - Removed invalid `deepLinks` from app.json.
   - Splash image set to `splash-icon.png` (real PNG) so schema validation passes.
   - Removed `eas-cli` from devDependencies (use `npx eas` instead).
   - `expo-dev-client` installed.

4. **Expo login**
   - Already logged in (`npx expo whoami` → thamer1989).

## You need to run (interactive)

Credentials must be set up in **interactive** mode once. After that, you can use non-interactive builds.

### 1. iOS production build (interactive, to configure credentials)

```bash
npx eas build --platform ios --profile production
```

- When prompted, choose **production**.
- First time: set up or select Apple Distribution certificate and provisioning profile.
- Build runs on EAS; when it finishes you’ll get a **build URL** (e.g. `https://expo.dev/accounts/.../builds/...`).

### 2. Submit latest build to TestFlight

After the build has completed:

```bash
npx eas submit -p ios --latest
```

- Select the **production** build when asked.
- EAS will submit that build to App Store Connect; it will show up in TestFlight after processing.

### 3. Optional: build and auto-submit in one go

```bash
npx eas build --platform ios --profile production --auto-submit
```

This runs the production iOS build and, when it finishes, submits it to TestFlight without a separate submit step.

---

## Build URL and TestFlight status

- **Build URL**: Shown in the terminal when the build finishes, and in the [Expo dashboard](https://expo.dev) under your project → Builds.
- **TestFlight**: After `eas submit` (or `--auto-submit`), the build appears in [App Store Connect](https://appstoreconnect.apple.com) → your app → TestFlight. Wait for “Processing” to complete (often 5–15 minutes) before testers can install.

## Note on bundle identifier

`ios.bundleIdentifier` is set to `com.halforder.app`. If your Apple Developer / App Store Connect app still uses `com.anonymous.ourfoodclean`, either:

- Create a new App Store Connect app with `com.halforder.app`, or  
- Set `ios.bundleIdentifier` back to `com.anonymous.ourfoodclean` in app.json so it matches the existing app.
