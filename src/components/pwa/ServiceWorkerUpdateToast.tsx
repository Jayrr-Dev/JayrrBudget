"use client";

import { useSerwist } from "@serwist/turbopack/react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

const UPDATE_TOAST_ID = "serwist-update-available";

export function ServiceWorkerUpdateToast() {
  const { serwist } = useSerwist();
  const listening = useRef(false);

  useEffect(() => {
    if (!serwist || listening.current) {
      return;
    }
    listening.current = true;

    const onWaiting = () => {
      toast("Update available", {
        id: UPDATE_TOAST_ID,
        description: "A new version is ready. Reload to use it.",
        duration: Number.POSITIVE_INFINITY,
        action: {
          label: "Reload",
          onClick: () => {
            serwist.addEventListener("controlling", () => {
              window.location.reload();
            });
            serwist.messageSkipWaiting();
          },
        },
      });
    };

    serwist.addEventListener("waiting", onWaiting);
  }, [serwist]);

  return null;
}
