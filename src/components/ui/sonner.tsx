"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import {
  Toaster as Sonner,
  toast as sonnerToast,
  type ExternalToast,
  type ToasterProps,
} from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      position="top-right"
      closeButton
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

const compactDefaults: ExternalToast = {
  duration: 2200,
  closeButton: false,
  className: "cn-toast-compact",
  classNames: {
    toast: "cn-toast cn-toast-compact",
    title: "cn-toast-compact-title",
    description: "cn-toast-compact-description",
    icon: "cn-toast-compact-icon",
  },
};

function withCompact(opts?: ExternalToast): ExternalToast {
  return {
    ...compactDefaults,
    ...opts,
    classNames: {
      ...compactDefaults.classNames,
      ...opts?.classNames,
    },
  };
}

/** Short, low-chrome toast for quick toolbar / button acknowledgments. */
const toastCompact = {
  success: (message: string | ReactNode, opts?: ExternalToast) =>
    sonnerToast.success(message, withCompact(opts)),
  error: (message: string | ReactNode, opts?: ExternalToast) =>
    sonnerToast.error(message, withCompact(opts)),
  info: (message: string | ReactNode, opts?: ExternalToast) =>
    sonnerToast.info(message, withCompact(opts)),
  warning: (message: string | ReactNode, opts?: ExternalToast) =>
    sonnerToast.warning(message, withCompact(opts)),
  message: (message: string | ReactNode, opts?: ExternalToast) =>
    sonnerToast(message, withCompact(opts)),
};

export { toastCompact, Toaster };
