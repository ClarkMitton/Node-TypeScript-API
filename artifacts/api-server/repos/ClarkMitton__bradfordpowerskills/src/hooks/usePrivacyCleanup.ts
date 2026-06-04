import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CleanupState {
  videoStoragePath: string | null;
  audioBlob: Blob | null;
  videoBlob: Blob | null;
  objectUrls: string[];
}

/**
 * Hook to manage privacy-related cleanup for session data.
 * Ensures that:
 * - Video files are deleted from storage after processing
 * - All blobs and object URLs are cleaned up on browser close
 * - Session data is cleared when the browser/tab closes
 */
export function usePrivacyCleanup() {
  const cleanupStateRef = useRef<CleanupState>({
    videoStoragePath: null,
    audioBlob: null,
    videoBlob: null,
    objectUrls: [],
  });

  // Track an object URL for cleanup
  const trackObjectUrl = useCallback((url: string) => {
    cleanupStateRef.current.objectUrls.push(url);
  }, []);

  // Update the storage path being tracked
  const trackVideoStoragePath = useCallback((path: string | null) => {
    cleanupStateRef.current.videoStoragePath = path;
  }, []);

  // Update blobs being tracked
  const trackBlobs = useCallback((audio: Blob | null, video: Blob | null) => {
    cleanupStateRef.current.audioBlob = audio;
    cleanupStateRef.current.videoBlob = video;
  }, []);

  // Delete video from storage
  const deleteVideoFromStorage = useCallback(async (storagePath: string): Promise<boolean> => {
    try {
      console.log("[Privacy] Deleting video from storage:", storagePath);
      const { error } = await supabase.storage
        .from("teaching-videos")
        .remove([storagePath]);

      if (error) {
        console.error("[Privacy] Failed to delete video:", error);
        return false;
      }

      console.log("[Privacy] Video deleted successfully");
      cleanupStateRef.current.videoStoragePath = null;
      return true;
    } catch (error) {
      console.error("[Privacy] Error deleting video:", error);
      return false;
    }
  }, []);

  // Revoke all tracked object URLs
  const revokeAllObjectUrls = useCallback(() => {
    cleanupStateRef.current.objectUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
        console.log("[Privacy] Revoked object URL");
      } catch (e) {
        // Ignore errors revoking URLs
      }
    });
    cleanupStateRef.current.objectUrls = [];
  }, []);

  // Full cleanup - called on browser close or manual reset
  const performFullCleanup = useCallback(async () => {
    console.log("[Privacy] Performing full cleanup...");

    // Revoke all object URLs
    revokeAllObjectUrls();

    // Clear blob references
    cleanupStateRef.current.audioBlob = null;
    cleanupStateRef.current.videoBlob = null;

    // Attempt to delete any pending video from storage
    // Note: This may not complete if the browser is closing
    const storagePath = cleanupStateRef.current.videoStoragePath;
    if (storagePath) {
      // Use sendBeacon for reliability during page unload
      try {
        const deleteUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cleanup-session`;
        const payload = JSON.stringify({ storagePath });
        
        if (navigator.sendBeacon) {
          navigator.sendBeacon(deleteUrl, payload);
          console.log("[Privacy] Sent cleanup beacon for:", storagePath);
        }
      } catch (e) {
        console.error("[Privacy] Beacon send failed:", e);
      }
    }

    // Clear any session-specific storage
    try {
      sessionStorage.removeItem("session_analysis_state");
    } catch (e) {
      // Ignore storage errors
    }

    console.log("[Privacy] Cleanup complete");
  }, [revokeAllObjectUrls]);

  // Set up beforeunload handler
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Synchronous cleanup
      revokeAllObjectUrls();
      
      // Attempt async cleanup via beacon
      const storagePath = cleanupStateRef.current.videoStoragePath;
      if (storagePath) {
        try {
          const deleteUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cleanup-session`;
          const payload = JSON.stringify({ storagePath });
          navigator.sendBeacon?.(deleteUrl, payload);
        } catch (e) {
          // Best effort
        }
      }
    };

    const handleVisibilityChange = () => {
      // When page becomes hidden (tab close, navigate away), attempt cleanup
      if (document.visibilityState === "hidden") {
        handleBeforeUnload();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [revokeAllObjectUrls]);

  return {
    trackObjectUrl,
    trackVideoStoragePath,
    trackBlobs,
    deleteVideoFromStorage,
    revokeAllObjectUrls,
    performFullCleanup,
  };
}
