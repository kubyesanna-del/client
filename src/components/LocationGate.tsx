import React, { ReactNode, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MapPin, Loader2, X } from 'lucide-react';
import { useLocation } from '../contexts/LocationContext';

interface LocationGateProps {
  children: ReactNode;
}

/**
 * Non-blocking location indicator.
 *
 * The app ALWAYS renders — navigation is never interrupted. When location
 * permission is denied/unsupported or GPS cannot produce a fix, a small
 * dismissible chip appears in the top-left corner so the user can re-enable it
 * at their convenience. While the first fix is still being acquired, a subtle
 * "locating" chip is shown instead.
 */
export const LocationGate: React.FC<LocationGateProps> = ({ children }) => {
  const {
    permissionStatus,
    gpsEnabled,
    loading,
    latitude,
    longitude,
    requestPermission
  } = useLocation();

  const [dismissed, setDismissed] = useState(false);

  const hasFix = latitude !== null && longitude !== null;
  const needsAttention =
    permissionStatus === 'denied' ||
    permissionStatus === 'unsupported' ||
    !gpsEnabled;
  const locating = loading && !hasFix && !needsAttention;

  const renderChip = () => {
    if (needsAttention && !dismissed) {
      const unsupported = permissionStatus === 'unsupported';
      return (
        <motion.div
          key="needs-attention"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="flex items-center gap-2 rounded-full bg-white shadow-lg ring-1 ring-black/5 pl-3 pr-2 py-1.5"
        >
          <MapPin className="text-[#5B2EFF] shrink-0" size={16} />
          <span className="text-xs font-medium text-gray-700 max-w-[150px] truncate">
            {unsupported ? 'Location unavailable' : 'Location is off'}
          </span>
          {!unsupported && (
            <button
              onClick={requestPermission}
              className="text-xs font-semibold text-[#5B2EFF] hover:underline"
            >
              Enable
            </button>
          )}
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss location notice"
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={14} />
          </button>
        </motion.div>
      );
    }

    if (locating) {
      return (
        <motion.div
          key="locating"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="flex items-center gap-2 rounded-full bg-white/90 backdrop-blur shadow-md ring-1 ring-black/5 px-3 py-1.5"
        >
          <Loader2 className="text-[#5B2EFF] animate-spin shrink-0" size={14} />
          <span className="text-xs font-medium text-gray-600">Locating…</span>
        </motion.div>
      );
    }

    return null;
  };

  return (
    <>
      <div className="fixed top-3 left-3 z-[60] pointer-events-none">
        <div className="pointer-events-auto">
          <AnimatePresence>{renderChip()}</AnimatePresence>
        </div>
      </div>
      {children}
    </>
  );
};
