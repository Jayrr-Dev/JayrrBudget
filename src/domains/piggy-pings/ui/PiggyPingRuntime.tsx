"use client";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  pingToastTone,
  type PingToastTone,
} from "@/domains/piggy-pings/domain/pingToastTone";
import type { PingType } from "@/domains/piggy-pings/domain/types";
import { PiggyPingToastIcon } from "@/domains/piggy-pings/ui/PiggyPingToastIcon";
import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

export type DeliverablePing = {
  title: string;
  message: string;
  pingTypes: PingType[];
  tone?: PingToastTone;
  icon?: string | null;
};

type PiggyPingRuntimeValue = {
  deliver: (ping: DeliverablePing) => void;
};

const PiggyPingRuntimeContext = createContext<PiggyPingRuntimeValue | null>(
  null,
);

function toastOptions(ping: DeliverablePing) {
  const tone = ping.tone ?? pingToastTone(ping);
  return {
    description: ping.message,
    icon: <PiggyPingToastIcon tone={tone} icon={ping.icon} />,
    className: "cn-toast cn-toast-piggy",
    classNames: {
      toast: "cn-toast cn-toast-piggy",
      icon: "cn-toast-piggy-icon",
    },
  };
}

export function deliverPingNow(ping: DeliverablePing) {
  for (const type of ping.pingTypes) {
    if (type === "Popup" || type === "Banner") continue;
    if (type === "Email") {
      toast.info(ping.title, {
        ...toastOptions(ping),
        description: `${ping.message}\n\nEmail send is not wired yet. This is the preview.`,
        duration: 8000,
      });
      continue;
    }
    toast.message(ping.title, {
      ...toastOptions(ping),
      duration: Infinity,
    });
  }
}

export function PiggyPingRuntime({ children }: { children: ReactNode }) {
  const [popup, setPopup] = useState<DeliverablePing | null>(null);
  const [banner, setBanner] = useState<DeliverablePing | null>(null);

  const deliver = useCallback((ping: DeliverablePing) => {
    deliverPingNow(ping);
    if (ping.pingTypes.includes("Popup")) setPopup(ping);
    if (ping.pingTypes.includes("Banner")) setBanner(ping);
  }, []);

  const value = useMemo(() => ({ deliver }), [deliver]);

  return (
    <PiggyPingRuntimeContext.Provider value={value}>
      {children}
      <AlertDialog
        open={popup !== null}
        onOpenChange={(open) => {
          if (!open) setPopup(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{popup?.title}</AlertDialogTitle>
            <AlertDialogDescription>{popup?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Dismiss</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {banner && typeof document !== "undefined"
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center p-3">
              <Alert className="pointer-events-auto w-full max-w-xl shadow-lg">
                <AlertTitle>{banner.title}</AlertTitle>
                <AlertDescription>{banner.message}</AlertDescription>
                <AlertAction>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Dismiss banner"
                    onClick={() => setBanner(null)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </AlertAction>
              </Alert>
            </div>,
            document.body,
          )
        : null}
    </PiggyPingRuntimeContext.Provider>
  );
}

export function usePiggyPingRuntime() {
  const value = useContext(PiggyPingRuntimeContext);
  if (!value) {
    return {
      deliver: deliverPingNow,
    };
  }
  return value;
}
