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
    authToken?: string;
    refreshToken?: string;
    databaseUrl?: string;
    apiKey?: string;
    projectId?: string;
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
    authToken?: string;
    refreshToken?: string;
    databaseUrl?: string;
    apiKey?: string;
    projectId?: string;
  }): Promise<{ success: boolean; message?: string }>;
  updateAuthToken(options: {
    authToken: string;
    refreshToken?: string;
  }): Promise<{ success: boolean }>;
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
  authToken?: string;
  refreshToken?: string;
  databaseUrl?: string;
  apiKey?: string;
  projectId?: string;
}

/**
 * Start Android foreground service for continuous GPS tracking.
 * Keeps GPS tracking active in background and sends updates to Firebase RTDB
 * even when the app is minimized, screen is off, or app is closed.
 */
export async function startForegroundService(options: StartForegroundServiceOptions): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    console.log('[ForegroundService] Not needed on web/PWA');
    return;
  }

  try {
    console.log('[ForegroundService] Starting foreground service with options:', {
      busNumber: options.busNumber,
      routeId: options.routeId,
      hasAuthToken: !!options.authToken,
    });
    const result = await LocationService.startForegroundService({
      driverId: options.driverId,
      driverName: options.driverName,
      busNumber: options.busNumber,
      routeId: options.routeId,
      routeName: options.routeName,
      routeState: options.routeState,
      currentStopName: options.currentStopName,
      authToken: options.authToken,
      refreshToken: options.refreshToken,
      databaseUrl: options.databaseUrl,
      apiKey: options.apiKey,
      projectId: options.projectId,
    });
    console.log('[ForegroundService] Foreground service started:', result);
  } catch (error) {
    console.error('[ForegroundService] Error starting foreground service:', error);
    throw error;
  }
}

/**
 * Stop Android foreground service and clear notification.
 * Called when the trip completes or driver explicitly logs out.
 */
export async function stopForegroundService(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    await LocationService.stopForegroundService();
    console.log('[ForegroundService] Foreground service stopped');
  } catch (error) {
    console.error('[ForegroundService] Error stopping foreground service:', error);
  }
}

/**
 * Update route info and stop name in running foreground service.
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
      authToken: options.authToken,
      refreshToken: options.refreshToken,
      databaseUrl: options.databaseUrl,
      apiKey: options.apiKey,
      projectId: options.projectId,
    });
    console.log('[ForegroundService] Route info updated');
  } catch (error) {
    console.error('[ForegroundService] Error updating route info:', error);
  }
}

/**
 * Update Firebase Auth token in running foreground service.
 */
export async function updateForegroundServiceAuthToken(authToken: string, refreshToken?: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    await LocationService.updateAuthToken({ authToken, refreshToken });
    console.log('[ForegroundService] Auth token forwarded to foreground service');
  } catch (error) {
    console.warn('[ForegroundService] Failed to forward auth token to foreground service:', error);
  }
}
