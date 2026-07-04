import { WebPlugin } from '@capacitor/core';
import type { PermissionsPlugin, PermissionStatus, LocationPermissionLevel } from './permissions';

export class PermissionsWeb extends WebPlugin implements PermissionsPlugin {
  async requestAllPermissions(): Promise<PermissionStatus> {
    // On web, request geolocation permission
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

  async checkPermissions(): Promise<PermissionStatus> {
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

  async openAppLocationSettings(): Promise<void> {
    // Not applicable on web - log warning
    console.warn('[PermissionsWeb] openAppLocationSettings is not available on web');
  }

  async getLocationPermissionLevel(): Promise<LocationPermissionLevel> {
    // On web, assume "always" if geolocation is granted
    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      return {
        level: permission.state === 'granted' ? 'always' : 'denied',
        hasForeground: permission.state === 'granted',
        hasBackground: true, // Not applicable on web
      };
    } catch {
      return {
        level: 'denied',
        hasForeground: false,
        hasBackground: false,
      };
    }
  }

  async requestBackgroundLocationOnly(): Promise<{ status: string }> {
    // Not applicable on web - always consider granted
    console.warn('[PermissionsWeb] requestBackgroundLocationOnly is not available on web');
    return { status: 'granted' };
  }

  async requestNotificationPermission(): Promise<{ status: string; notNeeded?: boolean }> {
    // Not applicable on web - always consider granted
    console.warn('[PermissionsWeb] requestNotificationPermission is not available on web');
    return { status: 'granted', notNeeded: true };
  }
}
