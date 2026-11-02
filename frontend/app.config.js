module.exports = {
  expo: {
    name: "Zoink",
    slug: "zoink",
    scheme: "zoink",
    version: "1.0.0",
    // Over-the-air JS updates (EAS Update). An update only reaches binaries
    // with the same runtime version; the fingerprint policy derives it from
    // the native layer (native dependencies, config plugins, native config),
    // so JS-only fixes can ship OTA while anything native needs a new build.
    runtimeVersion: {
      policy: "fingerprint",
    },
    updates: {
      url: "https://u.expo.dev/bf36f2d1-5e4c-498a-8ca5-38bc66817524",
    },
    orientation: "portrait",
    icon: "./assets/logo.png",
    userInterfaceStyle: "light",
    // The root view's colour before the first screen draws: the splash's tan,
    // so nothing flashes white between the splash and the app.
    backgroundColor: "#F4EDE1",
    splash: {
      image: "./assets/ZoinkTransparent.png",
      resizeMode: "contain",
      backgroundColor: "#F4EDE1",
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.zoink.app",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      softwareKeyboardLayoutMode: "resize",
      adaptiveIcon: {
        backgroundColor: "#F4EDE1",
        foregroundImage: "./assets/logo.png",
      },
      predictiveBackGestureEnabled: false,
      package: "com.zoink.app",
      // EAS Build only uploads git-tracked files, so the real credential can't
      // live at this path in CI. In EAS builds this comes from the
      // GOOGLE_SERVICES_JSON file-type environment variable (see
      // claude/playstore-prep-status.md); the literal path is a fallback for
      // local `expo start` / local prebuilds, where the gitignored file is
      // expected to exist on disk.
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
      permissions: [
        "android.permission.CAMERA",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
      ],
      blockedPermissions: [
        "android.permission.RECORD_AUDIO",
        "android.permission.WRITE_EXTERNAL_STORAGE",
      ],
    },
    web: {
      favicon: "./assets/logo.png",
    },
    plugins: [
      "expo-secure-store",
      "expo-notifications",
      [
        "expo-image-picker",
        {
          photosPermission: "Zoink needs access to your photos so you can add listing images.",
          cameraPermission: "Zoink needs your camera to take pickup and return photos so both sides of a handoff can be verified.",
          microphonePermission: false,
        },
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission: "Zoink uses your location to show nearby listings and to set an accurate pickup location for items you list.",
          isIosBackgroundLocationEnabled: false,
          isAndroidBackgroundLocationEnabled: false,
        },
      ],
      [
        "@stripe/stripe-react-native",
        {
          merchantIdentifier: "merchant.com.zoink.app",
          enableGooglePay: true,
        },
      ],
      "expo-font",
    ],
    extra: {
      eas: {
        projectId: "bf36f2d1-5e4c-498a-8ca5-38bc66817524",
      },
    },
    owner: "zoinkit",
  },
};
