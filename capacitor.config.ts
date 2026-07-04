import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.route.master.driver',
  appName: 'Route Master Driver',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
    buildOptions: {
      keystorePath: undefined, // Add your keystore path for release builds
    },
  },
  plugins: {
    Geolocation: {
      permissions: {
        location: {
          usageDescription: 'This app needs access to your location to track the bus route in real-time for students.',
          permission: 'Allow Route Master Driver to access your location?',
        },
      },
    },
  },
};

export default config;
