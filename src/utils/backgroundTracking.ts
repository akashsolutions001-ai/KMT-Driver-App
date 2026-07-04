import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/**
 * Request to ignore battery optimizations (Android only)
 * This helps keep GPS tracking active even when screen is off
 */
export async function requestBatteryOptimizationIgnore(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return; // Not needed on web
  }

  try {
    // On Android, we need to open battery optimization settings
    // This is typically done via a deep link or by guiding the user
    // For now, we'll just log - you can add a custom plugin later if needed
    console.log('Battery optimization settings should be opened manually');
    console.log('Path: Settings > Apps > Route Master Driver > Battery > Unrestricted');
  } catch (error) {
    console.error('Error requesting battery optimization ignore:', error);
  }
}

/**
 * Keep screen awake during active route tracking
 * Uses Screen Wake Lock API (supported in modern browsers and PWAs)
 */
export class WakeLockManager {
  private wakeLock: WakeLockSentinel | null = null;

  async acquire(): Promise<boolean> {
    if (!('wakeLock' in navigator)) {
      console.warn('Wake Lock API not supported');
      return false;
    }

    try {
      // @ts-ignore - Wake Lock API types may not be available
      this.wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake lock acquired');
      return true;
    } catch (error: any) {
      console.error('Failed to acquire wake lock:', error);
      return false;
    }
  }

  async release(): Promise<void> {
    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
        this.wakeLock = null;
        console.log('Wake lock released');
      } catch (error) {
        console.error('Failed to release wake lock:', error);
      }
    }
  }

  isActive(): boolean {
    return this.wakeLock !== null;
  }
}

/**
 * Monitor app state changes and adjust tracking behavior
 */
export class AppStateMonitor {
  private isInBackground = false;
  private listeners: Array<(isBackground: boolean) => void> = [];

  constructor() {
    if (Capacitor.isNativePlatform()) {
      App.addListener('appStateChange', ({ isActive }) => {
        this.isInBackground = !isActive;
        this.notifyListeners();
      });
    } else {
      // Web fallback
      document.addEventListener('visibilitychange', () => {
        this.isInBackground = document.hidden;
        this.notifyListeners();
      });
    }
  }

  onStateChange(callback: (isBackground: boolean) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.isInBackground));
  }

  isBackground(): boolean {
    return this.isInBackground;
  }
}
