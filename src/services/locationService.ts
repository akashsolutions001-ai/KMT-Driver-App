import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

export interface LocationData {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
}

export interface LocationError {
  code: number;
  message: string;
}

// Check if running on native platform
const isNative = Capacitor.isNativePlatform();

/**
 * Get current GPS location
 * Uses Capacitor Geolocation on native platforms, falls back to web API
 */
export const getCurrentLocation = async (): Promise<LocationData> => {
  if (isNative) {
    try {
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      });

      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        timestamp: Date.now(),
        accuracy: position.coords.accuracy,
        speed: position.coords.speed || undefined,
        heading: position.coords.heading || undefined,
      };
    } catch (error: any) {
      let errorMessage = 'Unknown error occurred';
      
      if (error.message) {
        if (error.message.includes('permission')) {
          errorMessage = 'User denied the request for Geolocation.';
        } else if (error.message.includes('unavailable')) {
          errorMessage = 'Location information is unavailable.';
        } else if (error.message.includes('timeout')) {
          errorMessage = 'The request to get user location timed out.';
        }
      }

      throw {
        code: -1,
        message: errorMessage,
      } as LocationError;
    }
  }

  // Fallback to web API
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject({
        code: -1,
        message: 'Geolocation is not supported by this browser.',
      } as LocationError);
      return;
    }

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: Date.now(),
          accuracy: position.coords.accuracy,
          speed: position.coords.speed || undefined,
          heading: position.coords.heading || undefined,
        });
      },
      (error) => {
        let errorMessage = 'Unknown error occurred';

        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'User denied the request for Geolocation.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information is unavailable.';
            break;
          case error.TIMEOUT:
            errorMessage = 'The request to get user location timed out.';
            break;
        }

        reject({
          code: error.code,
          message: errorMessage,
        } as LocationError);
      },
      options
    );
  });
};

/**
 * Watch GPS location changes
 * Uses Capacitor Geolocation on native platforms for better background support
 * Returns a Promise that resolves to watchId (string for Capacitor, number for web)
 */
export const watchLocation = async (
  onSuccess: (location: LocationData) => void,
  onError: (error: LocationError) => void
): Promise<string | number | null> => {
  if (isNative) {
    try {
      // Use Capacitor Geolocation watchPosition
      const watchId = await Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        },
        (position, err) => {
          if (err) {
            let errorMessage = 'Unknown error occurred';
            
            if (err.message) {
              if (err.message.includes('permission')) {
                errorMessage = 'User denied the request for Geolocation.';
              } else if (err.message.includes('unavailable')) {
                errorMessage = 'Location information is unavailable.';
              } else if (err.message.includes('timeout')) {
                errorMessage = 'The request to get user location timed out.';
              }
            }

            onError({
              code: -1,
              message: errorMessage,
            });
            return;
          }

          if (position) {
            onSuccess({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              timestamp: Date.now(),
              accuracy: position.coords.accuracy,
              speed: position.coords.speed || undefined,
              heading: position.coords.heading || undefined,
            });
          }
        }
      );
      return watchId;
    } catch (err: any) {
      onError({
        code: -1,
        message: err.message || 'Failed to start location tracking.',
      });
      return null;
    }
  }

  // Fallback to web API
  if (!navigator.geolocation) {
    onError({
      code: -1,
      message: 'Geolocation is not supported by this browser.',
    });
    return null;
  }

  const options: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0,
  };

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      onSuccess({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        timestamp: Date.now(),
        accuracy: position.coords.accuracy,
        speed: position.coords.speed || undefined,
        heading: position.coords.heading || undefined,
      });
    },
    (error) => {
      let errorMessage = 'Unknown error occurred';

      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMessage = 'User denied the request for Geolocation.';
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = 'Location information is unavailable.';
          break;
        case error.TIMEOUT:
          errorMessage = 'The request to get user location timed out.';
          break;
      }

      onError({
        code: error.code,
        message: errorMessage,
      });
    },
    options
  );

  return String(watchId);
};

/**
 * Stop watching location
 */
export const clearWatch = (watchId: string | number | null): void => {
  if (watchId === null) return;

  if (isNative && typeof watchId === 'string') {
    // Capacitor Geolocation clearWatch
    Geolocation.clearWatch({ id: watchId }).catch((err) => {
      console.error('Error clearing Capacitor watch:', err);
    });
  } else if (typeof watchId === 'number' && navigator.geolocation) {
    // Web API clearWatch
    navigator.geolocation.clearWatch(watchId);
  }
};
