import { Capacitor } from '@capacitor/core';
import { registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export interface PermissionStatus {
  foregroundLocation: string;
  backgroundLocation: string;
  batteryOptimization: string;
  notifications?: string;
}

export interface LocationPermissionLevel {
  level: 'denied' | 'while_using' | 'always';
  hasForeground: boolean;
  hasBackground: boolean;
}

export interface PermissionsPlugin {
  requestAllPermissions(): Promise<PermissionStatus>;
  checkPermissions(): Promise<PermissionStatus>;
  openAppLocationSettings(): Promise<void>;
  getLocationPermissionLevel(): Promise<LocationPermissionLevel>;
  requestBackgroundLocationOnly(): Promise<{ status: string }>;
  requestNotificationPermission(): Promise<{ status: string; notNeeded?: boolean }>;
}

let Permissions: PermissionsPlugin;

try {
  Permissions = registerPlugin<PermissionsPlugin>('Permissions', {
    web: () => import('./permissions.web').then((m) => new m.PermissionsWeb()),
  });
} catch (error) {
  console.error('[Permissions] Failed to register plugin:', error);
  // Fallback to web implementation
  Permissions = {
    requestAllPermissions: async () => ({
      foregroundLocation: 'denied',
      backgroundLocation: 'denied',
      batteryOptimization: 'denied',
      notifications: 'denied',
    }),
    checkPermissions: async () => ({
      foregroundLocation: 'denied',
      backgroundLocation: 'denied',
      batteryOptimization: 'denied',
      notifications: 'denied',
    }),
    openAppLocationSettings: async () => {
      console.warn('[Permissions] openAppLocationSettings not available on web');
    },
    getLocationPermissionLevel: async () => ({
      level: 'always' as const,
      hasForeground: true,
      hasBackground: true,
    }),
    requestBackgroundLocationOnly: async () => ({
      status: 'granted',
    }),
    requestNotificationPermission: async () => ({
      status: 'granted',
      notNeeded: true,
    }),
  } as PermissionsPlugin;
}

/**
 * Request all required permissions for background GPS tracking
 * Similar to Swiggy/Zomato delivery apps - asks for everything upfront
 * 
 * Permissions requested:
 * 1. Foreground Location (ACCESS_FINE_LOCATION)
 * 2. Background Location (ACCESS_BACKGROUND_LOCATION) - Android 10+
 * 3. Notifications (POST_NOTIFICATIONS) - Android 13+
 * 4. Battery Optimization exemption
 */
export async function requestAllPermissions(): Promise<PermissionStatus> {
  if (!Capacitor.isNativePlatform()) {
    // On web, just check geolocation API
    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      return {
        foregroundLocation: permission.state === 'granted' ? 'granted' : 'denied',
        backgroundLocation: 'granted', // Not applicable on web
        batteryOptimization: 'granted', // Not applicable on web
        notifications: 'granted', // Not applicable on web
      };
    } catch {
      return {
        foregroundLocation: 'denied',
        backgroundLocation: 'granted',
        batteryOptimization: 'granted',
        notifications: 'granted',
      };
    }
  }

  try {
    console.log('[Permissions] Requesting all permissions via custom plugin...');

    // Try custom plugin first
    try {
      const result = await Permissions.requestAllPermissions();
      console.log('[Permissions] Custom plugin result:', result);
      return result;
    } catch (pluginError: any) {
      console.warn('[Permissions] Custom plugin failed, trying fallback:', pluginError);

      // Fallback: Use Capacitor Geolocation to request location permission
      try {
        await Geolocation.requestPermissions();
        console.log('[Permissions] Geolocation permission requested via Capacitor');
      } catch (geoError) {
        console.error('[Permissions] Geolocation fallback failed:', geoError);
      }

      // Return current status
      const currentStatus = await checkPermissions();
      return currentStatus;
    }
  } catch (error: any) {
    console.error('[Permissions] Error requesting permissions:', error);
    console.error('[Permissions] Error details:', error.message, error.code);

    // Return current status on error
    try {
      const currentStatus = await checkPermissions();
      return currentStatus;
    } catch {
      return {
        foregroundLocation: 'denied',
        backgroundLocation: 'denied',
        batteryOptimization: 'denied',
        notifications: 'denied',
      };
    }
  }
}

/**
 * Check current permission status
 */
export async function checkPermissions(): Promise<PermissionStatus> {
  if (!Capacitor.isNativePlatform()) {
    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      return {
        foregroundLocation: permission.state === 'granted' ? 'granted' : 'denied',
        backgroundLocation: 'granted',
        batteryOptimization: 'granted',
        notifications: 'granted',
      };
    } catch {
      return {
        foregroundLocation: 'denied',
        backgroundLocation: 'granted',
        batteryOptimization: 'granted',
        notifications: 'granted',
      };
    }
  }

  try {
    return await Permissions.checkPermissions();
  } catch (error) {
    console.error('Error checking permissions:', error);
    return {
      foregroundLocation: 'denied',
      backgroundLocation: 'denied',
      batteryOptimization: 'denied',
      notifications: 'denied',
    };
  }
}

/**
 * Check if all required permissions for background tracking are granted
 */
export async function hasAllRequiredPermissions(): Promise<boolean> {
  const status = await checkPermissions();
  return (
    status.foregroundLocation === 'granted' &&
    status.backgroundLocation === 'granted' &&
    status.batteryOptimization === 'granted'
  );
}

/**
 * Open app's location permission settings
 * Redirects user to app info -> Permissions -> Location
 * where they can select "Allow all the time"
 */
export async function openAppLocationSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    console.warn('[Permissions] openAppLocationSettings not available on web');
    return;
  }

  try {
    await Permissions.openAppLocationSettings();
    console.log('[Permissions] Opened app location settings');
  } catch (error) {
    console.error('[Permissions] Error opening app settings:', error);
    throw error;
  }
}

/**
 * Get detailed location permission level
 * Returns 'always', 'while_using', or 'denied'
 */
export async function getLocationPermissionLevel(): Promise<LocationPermissionLevel> {
  if (!Capacitor.isNativePlatform()) {
    // On web, assume always allowed if geolocation is granted
    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      return {
        level: permission.state === 'granted' ? 'always' : 'denied',
        hasForeground: permission.state === 'granted',
        hasBackground: true,
      };
    } catch {
      return {
        level: 'denied',
        hasForeground: false,
        hasBackground: false,
      };
    }
  }

  try {
    return await Permissions.getLocationPermissionLevel();
  } catch (error) {
    console.error('[Permissions] Error getting location level:', error);
    return {
      level: 'denied',
      hasForeground: false,
      hasBackground: false,
    };
  }
}

/**
 * Request only background location permission
 * Shows native Android dialog for "Allow all the time" option
 */
export async function requestBackgroundLocationOnly(): Promise<{ status: string }> {
  if (!Capacitor.isNativePlatform()) {
    return { status: 'granted' };
  }

  try {
    return await Permissions.requestBackgroundLocationOnly();
  } catch (error) {
    console.error('[Permissions] Error requesting background location:', error);
    return { status: 'error' };
  }
}

/**
 * Request notification permission (Android 13+)
 * Required to show foreground service notification
 */
export async function requestNotificationPermission(): Promise<{ status: string; notNeeded?: boolean }> {
  if (!Capacitor.isNativePlatform()) {
    return { status: 'granted', notNeeded: true };
  }

  try {
    return await Permissions.requestNotificationPermission();
  } catch (error) {
    console.error('[Permissions] Error requesting notification permission:', error);
    return { status: 'error' };
  }
}
