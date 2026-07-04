import { useState, useEffect } from 'react';
import { MapPin, Battery, Shield, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requestAllPermissions, checkPermissions, getLocationPermissionLevel } from '@/utils/permissions';
import { Capacitor } from '@capacitor/core';
import { BackgroundLocationPrompt } from './BackgroundLocationPrompt';

interface PermissionsRequestProps {
  onPermissionsGranted: () => void;
}

export function PermissionsRequest({ onPermissionsGranted }: PermissionsRequestProps) {
  const [permissions, setPermissions] = useState({
    foregroundLocation: 'unknown',
    backgroundLocation: 'unknown',
    batteryOptimization: 'unknown',
  });
  const [isRequesting, setIsRequesting] = useState(false);
  const [showBackgroundPrompt, setShowBackgroundPrompt] = useState(false);

  useEffect(() => {
    checkCurrentPermissions();
  }, []);

  const checkCurrentPermissions = async () => {
    const status = await checkPermissions();
    setPermissions(status);

    // If all granted, auto-proceed
    if (
      status.foregroundLocation === 'granted' &&
      status.backgroundLocation === 'granted' &&
      status.batteryOptimization === 'granted'
    ) {
      setTimeout(() => onPermissionsGranted(), 500);
    } else if (status.foregroundLocation === 'granted' && status.backgroundLocation !== 'granted') {
      // User has foreground but not background - show the upgrade prompt
      setShowBackgroundPrompt(true);
    }
  };

  const handleRequestPermissions = async () => {
    setIsRequesting(true);
    try {
      console.log('Requesting all permissions...');
      const result = await requestAllPermissions();
      console.log('Permission request result:', result);
      setPermissions(result);

      // Check if we need to show background location prompt
      if (Capacitor.isNativePlatform()) {
        const level = await getLocationPermissionLevel();
        console.log('Location permission level:', level);

        if (level.level === 'while_using') {
          // User granted "while using" - show prompt to upgrade
          setShowBackgroundPrompt(true);
          setIsRequesting(false);
          return;
        }
      }

      // Set up polling to check permission status after user interacts with dialogs
      let checkCount = 0;
      const maxChecks = 30; // Check for 30 seconds max

      const checkInterval = setInterval(async () => {
        checkCount++;
        const updated = await checkPermissions();
        console.log('Permission check:', updated);
        setPermissions(updated);

        // Also check location level
        if (Capacitor.isNativePlatform()) {
          const level = await getLocationPermissionLevel();
          if (level.level === 'while_using') {
            clearInterval(checkInterval);
            setIsRequesting(false);
            setShowBackgroundPrompt(true);
            return;
          }
        }

        if (
          updated.foregroundLocation === 'granted' &&
          updated.backgroundLocation === 'granted' &&
          updated.batteryOptimization === 'granted'
        ) {
          clearInterval(checkInterval);
          setIsRequesting(false);
          onPermissionsGranted();
        } else if (checkCount >= maxChecks) {
          clearInterval(checkInterval);
          setIsRequesting(false);
          // Still show current status even if not all granted
        }
      }, 1000); // Check every second

      // Also check immediately
      setTimeout(async () => {
        const updated = await checkPermissions();
        setPermissions(updated);
      }, 500);

    } catch (error) {
      console.error('Error requesting permissions:', error);
      setIsRequesting(false);
    }
  };

  const handleBackgroundPromptDismiss = () => {
    setShowBackgroundPrompt(false);
  };

  const handleBackgroundPermissionGranted = () => {
    setShowBackgroundPrompt(false);
    // Re-check all permissions
    checkCurrentPermissions();
  };

  // Skip on web (not native)
  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  const allGranted =
    permissions.foregroundLocation === 'granted' &&
    permissions.backgroundLocation === 'granted' &&
    permissions.batteryOptimization === 'granted';

  return (
    <>
      {/* Background Location Upgrade Prompt */}
      {showBackgroundPrompt && (
        <BackgroundLocationPrompt
          onDismiss={handleBackgroundPromptDismiss}
          onPermissionGranted={handleBackgroundPermissionGranted}
        />
      )}

      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card border rounded-lg p-6 max-w-md w-full space-y-6 shadow-lg">
          <div className="text-center space-y-2">
            <Shield className="w-12 h-12 text-primary mx-auto" />
            <h2 className="text-2xl font-bold text-foreground">Permissions Required</h2>
            <p className="text-sm text-muted-foreground">
              To track your bus location continuously, we need the following permissions:
            </p>
          </div>

          <div className="space-y-4">
            {/* Location Permission */}
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-secondary/50">
              <MapPin className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">Location Access</span>
                  {permissions.foregroundLocation === 'granted' ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {permissions.foregroundLocation === 'granted'
                    ? 'Allow all the time - ✓ Granted'
                    : 'Needs "Allow all the time" permission'}
                </p>
              </div>
            </div>

            {/* Background Location */}
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-secondary/50">
              <MapPin className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">Background Location</span>
                  {permissions.backgroundLocation === 'granted' ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {permissions.backgroundLocation === 'granted'
                    ? 'Can track when app is minimized - ✓ Granted'
                    : 'Required for tracking when screen is off'}
                </p>
              </div>
            </div>

            {/* Battery Optimization */}
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-secondary/50">
              <Battery className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">Battery Optimization</span>
                  {permissions.batteryOptimization === 'granted' ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {permissions.batteryOptimization === 'granted'
                    ? 'App won\'t be killed in background - ✓ Granted'
                    : 'Prevents Android from stopping GPS tracking'}
                </p>
              </div>
            </div>
          </div>

          {!allGranted && (
            <Button
              onClick={handleRequestPermissions}
              disabled={isRequesting}
              className="w-full"
              size="lg"
            >
              {isRequesting ? 'Requesting Permissions...' : 'Grant All Permissions'}
            </Button>
          )}

          {/* Debug info in development */}
          {process.env.NODE_ENV === 'development' && (
            <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
              <div>Foreground: {permissions.foregroundLocation}</div>
              <div>Background: {permissions.backgroundLocation}</div>
              <div>Battery: {permissions.batteryOptimization}</div>
            </div>
          )}

          {allGranted && (
            <Button
              onClick={onPermissionsGranted}
              className="w-full bg-green-600 hover:bg-green-700"
              size="lg"
            >
              <CheckCircle2 className="w-5 h-5 mr-2" />
              All Permissions Granted - Continue
            </Button>
          )}

          <p className="text-xs text-center text-muted-foreground">
            These permissions are required for continuous GPS tracking, just like Swiggy and Zomato delivery apps.
          </p>
        </div>
      </div>
    </>
  );
}

