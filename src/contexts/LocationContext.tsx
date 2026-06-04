import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode
} from 'react';
import { reverseGeocode } from '../services/geoapifyService';
import { calculateDistance } from '../utils/etaCalculation';

/**
 * Bolt/Uber-style global location system.
 *
 * Responsibilities:
 *  - Request location permission on startup.
 *  - Detect whether device GPS / location services are enabled.
 *  - Retrieve the current coordinates with high accuracy.
 *  - Reverse geocode coordinates into a human-readable address.
 *  - Continuously watch the user's position and update on movement, while
 *    throttling expensive reverse-geocoding API calls.
 *
 * This is the single source of truth for device location. All pages consume it
 * through the `useLocation` hook (and the backward-compatible `useGeolocation`).
 */

export type LocationPermissionStatus =
  | 'unknown'
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'unsupported';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface LocationContextValue {
  latitude: number | null;
  longitude: number | null;
  coords: Coordinates | null;
  address: string | null;
  accuracy: number | null;
  permissionStatus: LocationPermissionStatus;
  /** True when the device is able to deliver a position fix. */
  gpsEnabled: boolean;
  loading: boolean;
  error: string | null;
  /** True once permission is granted and we have a real coordinate fix. */
  isReady: boolean;
  /** (Re)request permission / restart the watcher. Used by retry buttons. */
  requestPermission: () => void;
  /** Force a one-off refresh of the current position. */
  refresh: () => void;
  /** Best-effort attempt to open device location settings. */
  openLocationSettings: () => void;
}

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

// Distance (km) the user must move before we spend a reverse-geocode API call.
const GEOCODE_DISTANCE_THRESHOLD_KM = 0.05; // ~50 meters
// Minimum time (ms) between reverse-geocode API calls regardless of movement.
const GEOCODE_TIME_THROTTLE_MS = 15000; // 15 seconds

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0
};

interface LocationProviderProps {
  children: ReactNode;
}

export const LocationProvider: React.FC<LocationProviderProps> = ({ children }) => {
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<LocationPermissionStatus>('unknown');
  const [gpsEnabled, setGpsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Watcher + throttling refs (do not trigger re-renders).
  const watchIdRef = useRef<number | null>(null);
  const lastGeocodeCoordsRef = useRef<Coordinates | null>(null);
  const lastGeocodeTimeRef = useRef<number>(0);
  const geocodeInFlightRef = useRef(false);

  // Throttled reverse geocoding: only hit the API when the user has moved a
  // meaningful distance or enough time has passed since the last lookup.
  const maybeReverseGeocode = useCallback(async (lat: number, lng: number) => {
    const now = Date.now();
    const last = lastGeocodeCoordsRef.current;
    const movedKm = last ? calculateDistance(last.lat, last.lng, lat, lng) : Infinity;
    const elapsed = now - lastGeocodeTimeRef.current;

    const shouldGeocode =
      !address ||
      movedKm >= GEOCODE_DISTANCE_THRESHOLD_KM ||
      elapsed >= GEOCODE_TIME_THROTTLE_MS;

    if (!shouldGeocode || geocodeInFlightRef.current) return;

    geocodeInFlightRef.current = true;
    lastGeocodeTimeRef.current = now;
    lastGeocodeCoordsRef.current = { lat, lng };

    try {
      const result = await reverseGeocode(lat, lng);
      if (result?.address) {
        setAddress(result.address);
      } else {
        setAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      }
    } catch {
      // Keep any previous address; fall back to coordinates if none.
      setAddress(prev => prev ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } finally {
      geocodeInFlightRef.current = false;
    }
  }, [address]);

  const handleSuccess = useCallback((position: GeolocationPosition) => {
    const { latitude: lat, longitude: lng, accuracy: acc } = position.coords;
    setLatitude(lat);
    setLongitude(lng);
    setAccuracy(acc ?? null);
    setPermissionStatus('granted');
    setGpsEnabled(true);
    setLoading(false);
    setError(null);
    void maybeReverseGeocode(lat, lng);
  }, [maybeReverseGeocode]);

  const handleError = useCallback((err: GeolocationPositionError) => {
    setLoading(false);
    switch (err.code) {
      case err.PERMISSION_DENIED:
        setPermissionStatus('denied');
        setError('Location permission denied');
        break;
      case err.POSITION_UNAVAILABLE:
        // Permission is fine but the device cannot produce a fix — usually
        // means location services / GPS are turned off.
        setGpsEnabled(false);
        setError('Location services unavailable. Please enable GPS.');
        break;
      case err.TIMEOUT:
        setError('Timed out while retrieving your location.');
        break;
      default:
        setError('Unable to retrieve your location.');
    }
  }, []);

  const startWatching = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setPermissionStatus('unsupported');
      setLoading(false);
      setError('Geolocation is not supported on this device.');
      return;
    }

    // Clear any existing watch before starting a new one.
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setLoading(true);
    setError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      handleSuccess,
      handleError,
      GEO_OPTIONS
    );
  }, [handleSuccess, handleError]);

  const requestPermission = useCallback(() => {
    // Reset transient failure state, then (re)start the watcher which triggers
    // the browser permission prompt when still in the "prompt" state.
    setGpsEnabled(true);
    startWatching();
  }, [startWatching]);

  const refresh = useCallback(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, GEO_OPTIONS);
  }, [handleSuccess, handleError]);

  const openLocationSettings = useCallback(() => {
    // A pure web page cannot open the OS location settings panel directly.
    // If running inside a native wrapper that exposes a bridge, use it;
    // otherwise re-request permission as a best-effort fallback.
    const nativeBridge = (window as unknown as {
      openLocationSettings?: () => void;
    }).openLocationSettings;

    if (typeof nativeBridge === 'function') {
      nativeBridge();
    } else {
      requestPermission();
    }
  }, [requestPermission]);

  // On mount: read the Permissions API (where available) and start watching.
  useEffect(() => {
    let permissionStatusObj: PermissionStatus | null = null;

    const init = async () => {
      if (!('geolocation' in navigator)) {
        setPermissionStatus('unsupported');
        setLoading(false);
        setError('Geolocation is not supported on this device.');
        return;
      }

      // Query current permission state when the Permissions API is available.
      if ('permissions' in navigator && navigator.permissions?.query) {
        try {
          permissionStatusObj = await navigator.permissions.query({
            name: 'geolocation' as PermissionName
          });
          setPermissionStatus(permissionStatusObj.state as LocationPermissionStatus);

          // React to the user changing permission in browser/site settings.
          permissionStatusObj.onchange = () => {
            const state = permissionStatusObj?.state as LocationPermissionStatus;
            setPermissionStatus(state);
            if (state === 'granted') {
              startWatching();
            }
          };
        } catch {
          // Permissions API not fully supported — fall through to watch.
        }
      }

      // Starting the watcher triggers the prompt when needed and begins live
      // updates once granted.
      startWatching();
    };

    void init();

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (permissionStatusObj) {
        permissionStatusObj.onchange = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const coords: Coordinates | null =
    latitude !== null && longitude !== null ? { lat: latitude, lng: longitude } : null;

  const isReady = permissionStatus === 'granted' && coords !== null;

  const value: LocationContextValue = {
    latitude,
    longitude,
    coords,
    address,
    accuracy,
    permissionStatus,
    gpsEnabled,
    loading,
    error,
    isReady,
    requestPermission,
    refresh,
    openLocationSettings
  };

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
};

/**
 * Access the global location state. Must be used within a LocationProvider.
 */
export const useLocation = (): LocationContextValue => {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return ctx;
};
