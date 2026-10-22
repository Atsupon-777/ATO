// The iPhone / Android app (Capacitor). The React app is bundled into the app by `npm run app:build`
// (scripts/build-native.mjs) and talks to the server at API_ORIGIN; see app/native/README.md.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Bundle ID: must match the App ID registered in Apple Developer and the iOS app in Firebase.
  appId: 'com.atosns.reelsstudio',
  appName: 'Editless',
  webDir: 'app/native/www',
  backgroundColor: '#0a0a0b',
  // App screens never pinch-zoom (that, plus focus zoom, is what left pages shifted sideways).
  zoomEnabled: false,
  ios: {
    contentInset: 'never',
    zoomEnabled: false,
    // Long-press on a link opens nothing: an app screen, not a web page.
    allowsLinkPreview: false,
    // Large uploads and video playback from the server.
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    FirebaseAuthentication: {
      // Native sign-in: Google and Apple pages can't open inside the app's web view.
      skipNativeAuth: false,
      providers: ['apple.com', 'google.com', 'phone'],
    },
    FirebaseMessaging: {
      presentationOptions: ['alert', 'badge', 'sound'],
    },
  },
  experimental: {
    ios: {
      spm: {
        swiftToolsVersion: '6.1',
        packageOptions: {
          '@capacitor-firebase/authentication': { symlink: true },
          '@capacitor-firebase/messaging': { symlink: true },
        },
        // Google sign-in yes, Facebook SDK no.
        packageTraits: {
          '@capacitor-firebase/authentication': ['Google'],
        },
      },
    },
  },
};

export default config;
