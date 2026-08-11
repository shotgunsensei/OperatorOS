import type { ExpoConfig, ConfigContext } from 'expo/config';

const TEAM_ID = /^[A-Z0-9]{10}$/;
const FINGERPRINT = /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/;

export default ({ config }: ConfigContext): ExpoConfig => {
  const release = process.env.TORQUESHED_RELEASE_CONFIG === '1';
  const teamId = process.env.TORQUESHED_IOS_TEAM_ID?.trim().toUpperCase() ?? '';
  const fingerprint = process.env.TORQUESHED_ANDROID_SHA256_CERT_FINGERPRINT?.trim().toUpperCase() ?? '';
  const buildId = process.env.TORQUESHED_MOBILE_BUILD_ID?.trim() ?? '';
  if (release && !TEAM_ID.test(teamId)) throw new Error('TORQUESHED_IOS_TEAM_ID must be the real 10-character Apple team ID');
  if (release && !FINGERPRINT.test(fingerprint)) throw new Error('TORQUESHED_ANDROID_SHA256_CERT_FINGERPRINT must be the real SHA-256 signing fingerprint');
  if (release && !/^[A-Za-z0-9._-]{3,80}$/.test(buildId)) throw new Error('TORQUESHED_MOBILE_BUILD_ID is required for release builds');

  return {
    ...config,
    name: 'TorqueShed',
    slug: 'torqueshed',
    scheme: 'torqueshed',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'dark',
    plugins: ['expo-router', 'expo-secure-store', 'expo-image-picker'],
    experiments: { typedRoutes: true },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'pro.torqueshed.app',
      associatedDomains: ['applinks:torqueshed.operatoros.net'],
      infoPlist: {
        NSCameraUsageDescription: 'TorqueShed uses the camera to add evidence to build journals and diagnostics.',
        NSPhotoLibraryUsageDescription: 'TorqueShed uses selected photos as garage, build, and diagnostic evidence.',
      },
    },
    android: {
      package: 'pro.torqueshed.app',
      permissions: ['CAMERA', 'READ_MEDIA_IMAGES'],
      intentFilters: [{
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: 'torqueshed.operatoros.net', pathPrefix: '/' }],
        category: ['BROWSABLE', 'DEFAULT'],
      }],
    },
    extra: {
      router: {},
      apiBaseUrl: process.env.EXPO_PUBLIC_TORQUESHED_API_URL?.replace(/\/$/, '') ?? 'https://torqueshed.operatoros.net/api',
      authorizationUrl: process.env.EXPO_PUBLIC_TORQUESHED_AUTH_URL?.replace(/\/$/, '') ?? 'https://torqueshed.operatoros.net/native-auth',
      mobileBuildId: buildId || 'local-development',
    },
  };
};
