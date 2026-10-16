import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Geolocation } from '@capacitor/geolocation';
import {
  checkMandatoryLocationStatus,
  openAppLocationSettings,
  openDeviceLocationSettings,
  requestBackgroundLocationOnly,
  requestNotificationPermission,
  MandatoryLocationStatus,
} from '@/utils/permissions';

export function useMandatoryLocation() {
  const [status, setStatus] = useState<MandatoryLocationStatus>({
    isBlocked: true,
    reason: 'needs_foreground',
    hasForeground: false,
    hasBackground: false,
    isGpsEnabled: true,
    level: 'denied',
    message: 'Location permission is required to use the KMT Driver App. Your location is required for continuous bus tracking.',
  });
  const [isChecking, setIsChecking] = useState(true);
  const [isRequesting, setIsRequesting] = useState(false);
  const [denialCount, setDenialCount] = useState(0);
  const [isInitialAutoPrompt, setIsInitialAutoPrompt] = useState(true); // Suppress gate during initial auto-prompt

  const isMountedRef = useRef(true);
  const hasAutoPromptedRef = useRef(false);
  const isRequestingRef = useRef(false);

  const checkNow = useCallback(async () => {
    setIsChecking(true);
    try {
      const res = await checkMandatoryLocationStatus();
      if (isMountedRef.current) {
        setStatus(res);
      }
      return res;
    } catch (err) {
      console.error('[useMandatoryLocation] Check failed:', err);
      const fallback: MandatoryLocationStatus = {
        isBlocked: true,
        reason: 'needs_foreground',
        hasForeground: false,
        hasBackground: false,
        isGpsEnabled: true,
        level: 'denied',
        message: 'Location permission is required to use the KMT Driver App.',
      };
      if (isMountedRef.current) {
        setStatus(fallback);
      }
      return fallback;
    } finally {
      if (isMountedRef.current) {
        setIsChecking(false);
      }
    }
  }, []);

  const openSettings = useCallback(async () => {
    try {
      await openAppLocationSettings();
    } catch (err) {
      console.error('[useMandatoryLocation] Failed to open app settings:', err);
    }
  }, []);

  const openGpsSettings = useCallback(async () => {
    try {
      await openDeviceLocationSettings();
    } catch (err) {
      console.error('[useMandatoryLocation] Failed to open GPS settings:', err);
    }
  }, []);

  /**
   * Directly request or redirect to the location permission page.
   * Order: Notification → Foreground Location → Background Location ("Allow all the time")
   * - If foreground is needed: requests notifications first, then foreground GPS, then immediately continues to background.
   * - If background is needed ("Allow all the time"): triggers native prompt ("Change in settings")
   *   or directly redirects to App Settings so the driver can tap "Allow all the time".
   * - If GPS hardware is off: opens Device Location (GPS) settings.
   */
  const requestPermission = useCallback(async (forcedStatus?: MandatoryLocationStatus) => {
    if (isRequestingRef.current) return;
    isRequestingRef.current = true;
    setIsRequesting(true);

    try {
      const current = forcedStatus || (await checkMandatoryLocationStatus());

      if (!current.isBlocked) {
        if (isMountedRef.current) {
          setStatus(current);
        }
        return;
      }

      if (!Capacitor.isNativePlatform()) {
        // Web flow: Trigger browser geolocation prompt
        try {
          await new Promise<void>((resolve, reject) => {
            if (!navigator.geolocation) {
              reject(new Error('Geolocation not supported'));
              return;
            }
            navigator.geolocation.getCurrentPosition(
              () => resolve(),
              (err) => reject(err),
              { timeout: 8000, enableHighAccuracy: true }
            );
          });
        } catch (e) {
          console.warn('[useMandatoryLocation] Web geolocation prompt denied/cancelled:', e);
        }
        await checkNow();
        return;
      }

      // Android Flow
      if (current.reason === 'needs_foreground') {
        // Step 1: Request notification permission FIRST (Android 13+)
        console.log('[useMandatoryLocation] Step 1: Requesting notification permission...');
        try {
          const notifRes = await requestNotificationPermission();
          console.log('[useMandatoryLocation] Notification permission result:', notifRes);
        } catch (notifErr) {
          console.warn('[useMandatoryLocation] Notification permission failed:', notifErr);
        }

        // Small delay between permission dialogs for better UX
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Step 2: Request foreground location
        console.log('[useMandatoryLocation] Step 2: Requesting foreground location...');
        let permResult = null;
        try {
          permResult = await Geolocation.requestPermissions();
          console.log('[useMandatoryLocation] Geolocation.requestPermissions result:', permResult);
        } catch (locErr) {
          console.warn('[useMandatoryLocation] Geolocation.requestPermissions failed:', locErr);
        }

        if (permResult?.location === 'granted') {
          // Foreground granted! Seamlessly proceed directly to Background Location ("Allow all the time")
          console.log('[useMandatoryLocation] Step 3: Foreground granted, directly requesting background location...');
          await new Promise((resolve) => setTimeout(resolve, 400));

          try {
            const bgRes = await requestBackgroundLocationOnly();
            console.log('[useMandatoryLocation] requestBackgroundLocationOnly result:', bgRes);
          } catch (bgErr) {
            console.warn('[useMandatoryLocation] Background location prompt error:', bgErr);
          }

          // Check if background permission was granted or if settings should be opened
          const updated = await checkMandatoryLocationStatus();
          if (updated.reason === 'needs_background') {
            console.log('[useMandatoryLocation] Redirecting to App Settings for "Allow all the time"...');
            try {
              await openAppLocationSettings();
            } catch (settingsErr) {
              console.warn('[useMandatoryLocation] Could not open app settings:', settingsErr);
            }
          }
        } else {
          setDenialCount((prev) => prev + 1);
        }
      } else if (current.reason === 'needs_background') {
        // Foreground is already granted, but Background Location ("Allow all the time") is missing
        console.log('[useMandatoryLocation] Requesting background location / redirecting to settings directly...');
        try {
          const bgRes = await requestBackgroundLocationOnly();
          console.log('[useMandatoryLocation] requestBackgroundLocationOnly result:', bgRes);
        } catch (bgErr) {
          console.warn('[useMandatoryLocation] Direct background prompt skipped:', bgErr);
        }

        // Re-check; if still needs background, open settings directly
        const updated = await checkMandatoryLocationStatus();
        if (updated.reason === 'needs_background') {
          console.log('[useMandatoryLocation] Opening location settings so driver can tap "Allow all the time"...');
          try {
            await openAppLocationSettings();
          } catch (settingsErr) {
            console.warn('[useMandatoryLocation] Could not open app settings:', settingsErr);
          }
        }
      } else if (current.reason === 'gps_disabled') {
        console.log('[useMandatoryLocation] GPS is off, opening device GPS settings...');
        try {
          await openDeviceLocationSettings();
        } catch (gpsErr) {
          console.warn('[useMandatoryLocation] Could not open GPS settings:', gpsErr);
        }
      }

      await checkNow();
    } catch (err) {
      console.error('[useMandatoryLocation] Permission request failed:', err);
      setDenialCount((prev) => prev + 1);
      await checkNow();
    } finally {
      isRequestingRef.current = false;
      if (isMountedRef.current) {
        setIsRequesting(false);
      }
    }
  }, [checkNow]);

  // Set up listeners for startup, resume, settings return, and focus
  useEffect(() => {
    isMountedRef.current = true;

    // Auto-prompt on first open
    const initializeAndAutoRedirect = async () => {
      const initialStatus = await checkNow();
      if (initialStatus.isBlocked && !hasAutoPromptedRef.current) {
        hasAutoPromptedRef.current = true;
        console.log('[useMandatoryLocation] First open: automatically triggering permission dialogs...');
        // Small delay to allow initial UI to mount cleanly before presenting system prompt/settings
        setTimeout(async () => {
          if (isMountedRef.current) {
            await requestPermission(initialStatus);
            // After auto-prompt completes, allow the gate to show if still blocked
            if (isMountedRef.current) {
              setIsInitialAutoPrompt(false);
            }
          }
        }, 300);
      } else {
        // Permissions already granted or not first open
        setIsInitialAutoPrompt(false);
      }
    };

    initializeAndAutoRedirect();

    let appResumeListener: { remove: () => void } | null = null;
    let appStateListener: { remove: () => void } | null = null;

    if (Capacitor.isNativePlatform()) {
      App.addListener('resume', () => {
        console.log('[useMandatoryLocation] App resume event -> re-checking permissions');
        checkNow();
      }).then((l) => {
        appResumeListener = l;
      });

      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          console.log('[useMandatoryLocation] App became active -> re-checking permissions');
          checkNow();
        }
      }).then((l) => {
        appStateListener = l;
      });
    }

    const handleFocus = () => {
      checkNow();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkNow();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      if (appResumeListener) appResumeListener.remove();
      if (appStateListener) appStateListener.remove();
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkNow, requestPermission]);

  return {
    status,
    isBlocked: status.isBlocked && !isInitialAutoPrompt, // Suppress gate during initial auto-prompt
    isChecking,
    isRequesting,
    denialCount,
    checkNow,
    requestPermission,
    openSettings,
    openGpsSettings,
  };
}
