# CI/CD APK Build Setup Guide

This guide explains how to set up automated APK builds for the EliteReply app using GitHub Actions and EAS Build.

## 🚀 Available Workflows

We have created three different CI/CD workflows for building APKs:

### 1. **build-preview-cloud.yml** - EAS Cloud Build (Recommended)
- Uses Expo's cloud infrastructure
- Faster setup, no local Android SDK needed
- Requires EXPO_TOKEN
- Best for production-like builds

### 2. **build-preview-local.yml** - EAS Local Build  
- Builds on GitHub Actions runners
- No EAS cloud usage limits
- Requires Android SDK setup in CI
- Good for frequent builds

### 3. **build-apk.yml** - Original Workflow (Updated)
- Basic prebuild + Gradle approach
- Fallback option

## 🔧 Setup Instructions

### Step 1: Get Expo Access Token

1. Go to [expo.dev](https://expo.dev)
2. Sign in to your account
3. Go to Account Settings → Access Tokens
4. Create a new token with name "GitHub Actions"
5. Copy the token

### Step 2: Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add these secrets:

| Secret Name | Description | Required For |
|------------|-------------|--------------|
| `EXPO_TOKEN` | Expo access token from Step 1 | Cloud builds |
| `GOOGLE_SERVICES_JSON` | Content of google-services.json file | All builds |
| `CREDENTIALS_JSON` | Content of credentials.json file | All builds |

**To get file contents for secrets:**

```bash
# For GOOGLE_SERVICES_JSON
cat google-services.json | pbcopy

# For CREDENTIALS_JSON  
cat credentials.json | pbcopy
```

### Step 3: Update EAS Configuration (Optional)

Your current `eas.json` looks good! You can add more build profiles if needed:

```json
{
  "build": {
    "preview-ci": {
      "distribution": "internal",
      "android": {
        "buildType": "apk",
        "gradleCommand": ":app:assembleRelease"
      },
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

## 🎯 How to Use

### Manual Trigger (Recommended for Testing)

1. Go to Actions tab in your GitHub repository
2. Select "Build Preview APK (Cloud)" or "Build Preview APK (Local)"
3. Click "Run workflow"
4. Choose your build profile
5. Click "Run workflow"

### Automatic Triggers

The workflows automatically run on:
- **Push to main branch** - Creates a GitHub release with APK
- **Pull requests** - Builds APK and comments on PR with download link

### Build Profiles Available

- `preview` - Standard preview build (cloud)
- `preview-local` - Preview build for local EAS builds
- `development` - Development build with dev client
- `development-local` - Development build for local EAS builds

## 📱 Getting Your APK

### From Workflow Artifacts
1. Go to the completed workflow run
2. Scroll to "Artifacts" section  
3. Download the APK zip file
4. Extract and install on Android device

### From GitHub Releases (Main Branch Only)
1. Go to Releases tab in your repository
2. Find the latest preview release
3. Download the APK directly

## 🔍 Troubleshooting

### Build Fails with "EXPO_TOKEN" Error
- Make sure you've added the EXPO_TOKEN secret
- Verify the token is valid and has the right permissions
- Try regenerating the token

### Build Fails with Missing Files
- Ensure google-services.json exists in your repository OR is set as secret
- Ensure credentials.json exists in your repository OR is set as secret
- Check that both files have valid JSON content

### Local Build Takes Too Long
- Local builds can take 15-30 minutes
- Use cloud builds for faster results
- Consider using build caching (already enabled)

### APK Size Too Large
- Check your assets folder for large files
- Consider using different build profiles
- Review dependencies in package.json

## 🔄 Workflow Features

### Cloud Build Workflow Features:
- ✅ Automatic build status monitoring
- ✅ APK download and artifact upload  
- ✅ GitHub release creation (main branch)
- ✅ PR comments with download links
- ✅ Build timeout handling (30 minutes)

### Local Build Workflow Features:
- ✅ Full Android SDK setup
- ✅ Local EAS building
- ✅ APK artifact upload
- ✅ GitHub release creation
- ✅ PR comments with download links
- ✅ Build caching for faster builds

## 📊 Build Matrix (Future Enhancement)

You can extend the workflows to build multiple variants:

```yaml
strategy:
  matrix:
    profile: [preview, development]
    include:
      - profile: preview
        build-type: release
      - profile: development  
        build-type: debug
```

## 🚨 Security Notes

- Secrets are only available in the main repository (not forks)
- APK artifacts are stored for 30 days by default
- Consider using environment-specific secrets for production builds
- Review who has access to your repository secrets

## 📞 Support

If you encounter issues:

1. Check the workflow logs for specific error messages
2. Verify all secrets are properly configured
3. Test builds locally first: `eas build --platform android --profile preview --local`
4. Review EAS Build documentation: [docs.expo.dev/build/introduction](https://docs.expo.dev/build/introduction/)