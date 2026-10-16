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
    currentStopName?: string;
    authToken?: string;
    refreshToken?: string;
    databaseUrl?: string;
    apiKey?: string;
    projectId?: string;
  }): Promise<{ success: boolean; message?: string }> {
    // No-op on web - GPS tracking happens via JavaScript on web
    return { success: true, message: 'Web platform - using JavaScript GPS tracking' };
  }

  async stopForegroundService(): Promise<{ success: boolean }> {
    return { success: true };
  }

  async updateRouteInfo(_options: {
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
  }): Promise<{ success: boolean; message?: string }> {
    return { success: true, message: 'Web platform - no foreground service' };
  }

  async updateAuthToken(_options: {
    authToken: string;
    refreshToken?: string;
  }): Promise<{ success: boolean }> {
    return { success: true };
  }
}
