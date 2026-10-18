import type { ConfigContext, ExpoConfig } from 'expo/config';

// Universal / app links for printed venue QR codes (https://<host>/v/<code>). Set UNIVERSAL_LINKS_HOST
// (e.g. natterium.com) only once the web serves its .well-known files; it needs a new native build.
export default ({ config }: ConfigContext): ExpoConfig => {
  const host = process.env.UNIVERSAL_LINKS_HOST;
  if (!host) return config as ExpoConfig;
  return {
    ...config,
    ios: { ...config.ios, associatedDomains: [`applinks:${host}`] },
    android: { ...config.android, intentFilters: [{ action: 'VIEW', autoVerify: true, data: [{ scheme: 'https', host, pathPrefix: '/v/' }], category: ['BROWSABLE', 'DEFAULT'] }] },
  } as ExpoConfig;
};
