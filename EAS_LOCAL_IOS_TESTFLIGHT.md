This document explains how to provide local credentials and run a local EAS build for iOS (TestFlight).

Why you're seeing the error

- Some local build scripts or a developer workflow expect a `credentials.json` file in the project root containing pointers to your signing artifacts. If that file doesn't exist, the local build command can fail.

Quick options

1) Preferred (interactive): Let EAS CLI prompt you and supply the certificate and provisioning profile interactively when running `eas build --local`.
2) Non-interactive: Create `credentials.json` in the project root (based on `credentials.example.json`) with paths to your .p12 and .mobileprovision.

Example `credentials.json` (DO NOT commit secrets to source control)

{
  "ios": {
    "certificateP12Path": "./certs/distribution.p12",
    "certificatePassword": "p12-password",
    "provisioningProfilePath": "./certs/elite_reply_appstore.mobileprovision",
    "appleTeamId": "TEAMID1234",
    "appleId": "your@apple.email",
    "appSpecificBundleIdentifier": "com.yourcompany.elitereply"
  }
}

Recommended secure approach

- Put your `.p12` and `.mobileprovision` files in a local-only folder (e.g. `./certs/`) and add that folder to `.gitignore`.
- Use environment variables to pass secrets where possible. Example (zsh):

export P12_PATH=./certs/distribution.p12
export P12_PASSWORD="your-p12-password"
export PROV_PROFILE=./certs/elite_reply_appstore.mobileprovision

Then run:

eas build --platform ios --profile production-ios-local --local

When using environment variables or a local `credentials.json`, EAS CLI should use the supplied local credentials.

Uploading to TestFlight

- Use `eas submit --platform ios --path ./path/to/YourApp.ipa` or the Transporter app.
- For non-interactive submission prefer an App Store Connect API key and add its JSON file path to a secure environment variable.

If you want, I can:
- Add a `certs/` folder (empty) and update `.gitignore` to recommend ignoring it.
- Add `package.json` scripts for building and submitting locally.
- Create a small zsh snippet that sets env vars and runs the build non-interactively.

