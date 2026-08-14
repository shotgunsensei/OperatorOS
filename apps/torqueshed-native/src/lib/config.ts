import Constants from 'expo-constants';

type Extra = { apiBaseUrl?: string; authorizationUrl?: string; mobileBuildId?: string };
const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

export const nativeConfig = Object.freeze({
  apiBaseUrl: (extra.apiBaseUrl ?? 'https://torqueshed.operatoros.net/api').replace(/\/$/, ''),
  authorizationUrl: (extra.authorizationUrl ?? 'https://torqueshed.operatoros.net/native-auth').replace(/\/$/, ''),
  buildId: extra.mobileBuildId ?? 'local-development',
  redirectUri: 'torqueshed://sso',
});
