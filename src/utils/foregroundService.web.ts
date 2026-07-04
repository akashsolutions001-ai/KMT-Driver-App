import { WebPlugin } from '@capacitor/core';
import type { LocationServicePlugin } from './foregroundService';

export class LocationServiceWeb extends WebPlugin implements LocationServicePlugin {
  async startForegroundService(_options?: {
    driverId?: string;
    driverName?: string;
    busNumber?: string;
    routeId?: string;
    routeName?: string;
    routeState?: string;
  }): Promise<{ success: boolean; message?: string }> {
    // No-op on web - GPS tracking happens via JavaScript on web
    console.log('Foreground service not available on web');
    return { success: true, message: 'Web platform - using JavaScript GPS tracking' };
  }

  async stopForegroundService(): Promise<{ success: boolean }> {
    // No-op on web
    return { success: true };
  }

  async updateRouteInfo(_options: {
    driverId?: string;
    driverName?: string;
    busNumber?: string;
    routeId?: string;
    routeName?: string;
    routeState?: string;
  }): Promise<{ success: boolean; message?: string }> {
    // No-op on web
    return { success: true, message: 'Web platform - no foreground service' };
  }
}
