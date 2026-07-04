import { Capacitor } from '@capacitor/core';
import { registerPlugin } from '@capacitor/core';

export interface LocationServicePlugin {
  startForegroundService(options?: {
    driverId?: string;
    driverName?: string;
    busNumber?: string;
    routeId?: string;
    routeName?: string;
    routeState?: string;
    currentStopName?: string;
  }): Promise<{ success: boolean; message?: string }>;
  stopForegroundService(): Promise<{ success: boolean }>;
  updateRouteInfo(options: {
    driverId?: string;
    driverName?: string;
    busNumber?: string;
    routeId?: string;
    routeName?: string;
    routeState?: string;
    currentStopName?: string;
  }): Promise<{ success: boolean; message?: string }>;
}

const LocationService = registerPlugin<LocationServicePlugin>('LocationService', {
  web: () => import('./foregroundService.web').then((m) => new m.LocationServiceWeb()),
});

export interface StartForegroundServiceOptions {
  driverId: string;
  driverName: string;
  busNumber: string;
  routeId: string;
  routeName: string;
  routeState: 'not_started' | 'in_progress' | 'completed';
  currentStopName?: string;
}

/**
 * Start Android foreground service for continuous GPS tracking.
 * This keeps the app alive and tracking GPS even when minimized or screen is off.
 * GPS tracking happens natively - does NOT depend on WebView/JavaScript.
 * Shows a persistent "Trip Ongoing" notification like Swiggy/Zomato.
 */
export async function startForegroundService(options: StartForegroundServiceOptions): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    console.log('Foreground service not needed on web/PWA');
    return;
  }

  try {
    console.log('Starting foreground service with options:', options);
    const result = await LocationService.startForegroundService({
      driverId: options.driverId,
      driverName: options.driverName,
      busNumber: options.busNumber,
      routeId: options.routeId,
      routeName: options.routeName,
      routeState: options.routeState,
      currentStopName: options.currentStopName,
    });
    console.log('Foreground service started:', result);
  } catch (error) {
    console.error('Error starting foreground service:', error);
    throw error;
  }
}

/**
 * Stop Android foreground service
 * This will also remove the "Trip Ongoing" notification
 */
export async function stopForegroundService(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    await LocationService.stopForegroundService();
    console.log('Foreground service stopped');
  } catch (error) {
    console.error('Error stopping foreground service:', error);
  }
}

/**
 * Update route info in the running foreground service
 * This updates the notification with the current stop name
 */
export async function updateForegroundServiceRouteInfo(options: StartForegroundServiceOptions): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    await LocationService.updateRouteInfo({
      driverId: options.driverId,
      driverName: options.driverName,
      busNumber: options.busNumber,
      routeId: options.routeId,
      routeName: options.routeName,
      routeState: options.routeState,
      currentStopName: options.currentStopName,
    });
    console.log('Foreground service route info updated');
  } catch (error) {
    console.error('Error updating foreground service route info:', error);
  }
}

