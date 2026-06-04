import React, { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Navigation, Loader2, Settings } from 'lucide-react';
import { useLocation } from '../contexts/LocationContext';

interface LocationGateProps {
  children: ReactNode;
}

/**
 * Gates the application behind device location state, Bolt/Uber style:
 *  - Permission denied / unsupported  -> full-screen blocking message + retry.
 *  - Location services (GPS) disabled -> blocking modal + "open settings".
 *  - Otherwise renders the app (individual pages handle their own loading).
 */
export const LocationGate: React.FC<LocationGateProps> = ({ children }) => {
  const {
    permissionStatus,
    gpsEnabled,
    loading,
    latitude,
    longitude,
    requestPermission,
    openLocationSettings
  } = useLocation();

  const hasFix = latitude !== null && longitude !== null;

  // 1. Permission denied or unsupported -> full-screen required message.
  if (permissionStatus === 'denied' || permissionStatus === 'unsupported') {
    const unsupported = permissionStatus === 'unsupported';
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-50 p-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-sm w-full bg-white rounded-2xl shadow-lg p-8 text-center"
        >
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-[#5B2EFF]/10 flex items-center justify-center">
            <MapPin className="text-[#5B2EFF]" size={32} />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Location access required
          </h1>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            {unsupported
              ? 'This device or browser does not support location services, which are required to request rides and deliveries.'
              : 'We need access to your location to set your pick-up point and match you with nearby drivers. Please allow location access to continue.'}
          </p>
          {!unsupported && (
            <button
              onClick={requestPermission}
              className="w-full bg-[#5B2EFF] text-white font-semibold rounded-xl py-3 mb-3 hover:bg-[#4a25cc] transition-colors"
            >
              Allow location access
            </button>
          )}
          <p className="text-xs text-gray-400 leading-relaxed">
            If the prompt does not appear, enable location for this site in your
            browser or device settings, then tap the button again.
          </p>
        </motion.div>
      </div>
    );
  }

  // 2. Permission granted (or pending) but GPS / location services are off.
  if (!gpsEnabled) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-sm w-full bg-white rounded-2xl shadow-xl p-8 text-center"
        >
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-amber-50 flex items-center justify-center">
            <Navigation className="text-amber-500" size={30} />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Location Services Required
          </h1>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            Please enable GPS to continue.
          </p>
          <button
            onClick={openLocationSettings}
            className="w-full bg-[#5B2EFF] text-white font-semibold rounded-xl py-3 mb-3 flex items-center justify-center gap-2 hover:bg-[#4a25cc] transition-colors"
          >
            <Settings size={18} />
            Open location settings
          </button>
          <button
            onClick={requestPermission}
            className="w-full text-[#5B2EFF] font-medium rounded-xl py-2 hover:bg-gray-50 transition-colors"
          >
            Try again
          </button>
        </motion.div>
      </div>
    );
  }

  // 3. First-time acquisition: show a brief splash until we have a fix so pages
  //    do not flash with empty pick-up fields. Subsequent live updates never
  //    block the UI.
  if (loading && !hasFix && permissionStatus !== 'granted') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 text-[#5B2EFF] animate-spin mb-4" />
        <p className="text-sm text-gray-600 font-medium">Finding your location...</p>
      </div>
    );
  }

  return <>{children}</>;
};
