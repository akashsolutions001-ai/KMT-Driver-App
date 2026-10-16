import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kmt.driver',
  appName: 'KMT Driver App',
  webDir: 'dist',
  plugins: {
    Geolocation: {
      permissions: {
        location: {
          usageDescription: 'This app needs access to your location to track the bus route in real-time for students.',
          permission: 'Allow KMT Driver App to access your location?',
        },
      },
    },
  },
};

export default config;
