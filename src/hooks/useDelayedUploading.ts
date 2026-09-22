import { useEffect, useRef, useState } from 'react';

/**
 * Delays the visual "Uploading..." indicator so fast/instant uploads
 * don't flash a spinner. `uploading` toggles immediately (for disabling
 * inputs), while `showUploading` only becomes true after `delayMs`.
 * If the upload finishes before the delay, the spinner never appears.
 */
export function useDelayedUploading(delayMs = 350) {
  const [uploading, setUploading] = useState(false);
  const [showUploading, setShowUploading] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (uploading) {
      timerRef.current = window.setTimeout(() => setShowUploading(true), delayMs);
      return () => {
        if (timerRef.current != null) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      };
    } else {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setShowUploading(false);
    }
  }, [uploading, delayMs]);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
    };
  }, []);

  return { uploading, showUploading, setUploading };
}
