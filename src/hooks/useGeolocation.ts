import { useState, useEffect } from 'react';
import { reverseGeocode as geoapifyReverseGeocode } from '../services/geoapifyService';

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  loading: boolean;
  error: string | null;
}

export const useGeolocation = () => {
  const [location, setLocation] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    address: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    const reverseGeocodeLocation = async (lat: number, lng: number): Promise<string> => {
      try {
        const result = await geoapifyReverseGeocode(lat, lng);
        return result?.address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      } catch (error) {
        console.error('Reverse geocode error:', error);
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }
    };

    const handleSuccess = async (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      try {
        const address = await reverseGeocodeLocation(latitude, longitude);
        setLocation({
          latitude,
          longitude,
          address,
          loading: false,
          error: null
        });
      } catch (error) {
        setLocation({
          latitude,
          longitude,
          address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
          loading: false,
          error: null
        });
      }
    };

    const handleError = (error: GeolocationPositionError) => {
      console.warn('Geolocation unavailable:', error.message);
      setLocation({
        latitude: null,
        longitude: null,
        address: null,
        loading: false,
        error: error.message
      });
    };

    if (!navigator.geolocation) {
      setLocation({
        latitude: null,
        longitude: null,
        address: null,
        loading: false,
        error: 'Geolocation not supported'
      });
      return;
    }

    // Use watchPosition for reliable live GPS updates. maximumAge: 0 ensures we
    // always receive fresh coordinates rather than a cached fix.
    const watchId = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    });

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  return location;
};
