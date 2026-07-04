import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

/**
 * Request permissions directly using native Android dialogs
 * Similar to how delivery apps do it - no custom UI, just native prompts
 * Returns the permission status - doesn't show toasts, lets caller handle UI
 */
export async function requestPermissionsDirect(): Promise<{
  foregroundLocation: boolean;
  backgroundLocation: boolean;
  batteryOptimization: boolean;
  notifications: boolean;
  needsBackgroundPrompt: boolean;
}> {
  if (!Capacitor.isNativePlatform()) {
    // On web, just request geolocation
    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      return {
        foregroundLocation: permission.state === 'granted',
        backgroundLocation: true,
        batteryOptimization: true,
        notifications: true,
        needsBackgroundPrompt: false,
      };
    } catch {
      return {
        foregroundLocation: false,
        backgroundLocation: false,
        batteryOptimization: false,
        notifications: false,
        needsBackgroundPrompt: false,
      };
    }
  }

  const results = {
    foregroundLocation: false,
    backgroundLocation: false,
    batteryOptimization: false,
    notifications: false,
    needsBackgroundPrompt: false,
  };

  try {
    // Step 1: Request NOTIFICATION permission FIRST (Android 13+)
    // This is required to show the foreground service notification
    console.log('[Permissions] Requesting notification permission...');
    try {
      const { requestNotificationPermission } = await import('./permissions');
      const notifResult = await requestNotificationPermission();
      console.log('[Permissions] Notification permission result:', notifResult);

      if (notifResult.status === 'granted' || notifResult.status === 'already_granted' || notifResult.notNeeded) {
        results.notifications = true;
        console.log('[Permissions] Notification permission granted');
      }
    } catch (notifError) {
      console.warn('[Permissions] Notification permission request failed:', notifError);
    }

    // Wait a moment before requesting location
    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 2: Request foreground location permission using Capacitor Geolocation
    // This shows the native Android permission dialog directly
    console.log('[Permissions] Requesting foreground location via Capacitor Geolocation...');
    const locationPermission = await Geolocation.requestPermissions();

    if (locationPermission.location === 'granted') {
      results.foregroundLocation = true;
      console.log('[Permissions] Foreground location granted');

      // Step 3: Check if we have background location (Android 10+)
      // Wait a moment for foreground permission to register
      await new Promise(resolve => setTimeout(resolve, 300));

      try {
        const { getLocationPermissionLevel, requestBackgroundLocationOnly } = await import('./permissions');
        const level = await getLocationPermissionLevel();

        console.log('[Permissions] Location level after foreground grant:', level);

        if (level.level === 'always') {
          // Already have background permission
          results.backgroundLocation = true;
          console.log('[Permissions] Background location already granted');
        } else if (level.level === 'while_using') {
          // User only gave "while using" - try to request background via native dialog
          console.log('[Permissions] Only "while using" granted, requesting background...');

          try {
            const bgResult = await requestBackgroundLocationOnly();
            console.log('[Permissions] Background request result:', bgResult);

            // Re-check the level
            await new Promise(resolve => setTimeout(resolve, 500));
            const newLevel = await getLocationPermissionLevel();

            if (newLevel.level === 'always') {
              results.backgroundLocation = true;
              console.log('[Permissions] Background location now granted');
            } else {
              // User still has only "while using" - we need to show the popup
              results.needsBackgroundPrompt = true;
              console.log('[Permissions] Background location still not granted, need prompt');
            }
          } catch (bgError) {
            console.warn('[Permissions] Background request failed:', bgError);
            results.needsBackgroundPrompt = true;
          }
        }
      } catch (levelError) {
        console.warn('[Permissions] Error checking location level:', levelError);
      }

      // Step 4: Request battery optimization (opens settings, non-blocking)
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        console.log('[Permissions] Requesting battery optimization...');
        const { checkPermissions } = await import('./permissions');
        const batteryResult = await checkPermissions();

        if (batteryResult.batteryOptimization === 'granted') {
          results.batteryOptimization = true;
          console.log('[Permissions] Battery optimization granted');
        }
      } catch (batteryError) {
        console.warn('[Permissions] Battery optimization check failed:', batteryError);
      }

    } else {
      // Foreground location denied
      console.log('[Permissions] Foreground location denied');
    }
  } catch (error: any) {
    console.error('[Permissions] Error requesting permissions:', error);
  }

  return results;
}
