"use client";

import { CameraIcon, FileUpIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OCR_DOCUMENT_ACCEPT } from "@/domains/statements/domain/ocrDocumentTypes";
import { useIsMobile } from "@/hooks/use-mobile";

/** Utilitek receipt upload — touch hint. */
export const OCR_UPLOAD_HINT_TOUCH = "Tap to browse or take a photo";

/** Desktop dropzone hint. */
export const OCR_UPLOAD_HINT_POINTER = "Drag & drop or choose files";

type PickerOptions = {
  multiple?: boolean;
  disabled?: boolean;
  accept?: string;
  onFiles: (files: FileList | File[]) => void;
};

function useOcrCameraAvailable() {
  const isMobile = useIsMobile();
  const [cameraAvailable, setCameraAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function detectCamera() {
      // Phone/tablet: one tap opens the native sheet (Take photo / library / files).
      if (isMobile) {
        if (!cancelled) setCameraAvailable(true);
        return;
      }

      if (typeof navigator === "undefined" || !navigator.mediaDevices) {
        if (!cancelled) setCameraAvailable(false);
        return;
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (devices.some((device) => device.kind === "videoinput")) {
          if (!cancelled) setCameraAvailable(true);
          return;
        }
      } catch {
        // Permission / insecure context — fall through.
      }

      // Laptops often hide cameras until permission; still offer Take photo.
      if (!cancelled) setCameraAvailable(true);
    }

    void detectCamera();
    return () => {
      cancelled = true;
    };
  }, [isMobile]);

  return { isMobile, cameraAvailable };
}

function useOcrDocumentInputRefs(options: PickerOptions) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  function emitFromInput(input: HTMLInputElement | null) {
    if (!input?.files?.length) return;
    options.onFiles(input.files);
    input.value = "";
  }

  const inputs = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept={options.accept ?? OCR_DOCUMENT_ACCEPT}
        multiple={options.multiple}
        className="hidden"
        disabled={options.disabled}
        onChange={() => emitFromInput(fileRef.current)}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={options.disabled}
        onChange={() => emitFromInput(cameraRef.current)}
      />
    </>
  );

  return {
    inputs,
    openFilePicker: () => fileRef.current?.click(),
    openCamera: () => cameraRef.current?.click(),
  };
}

type Props = {
  disabled?: boolean;
  multiple?: boolean;
  /** Label / icon content for the trigger button. */
  children: React.ReactNode;
  className?: string;
  size?: React.ComponentProps<typeof Button>["size"];
  variant?: React.ComponentProps<typeof Button>["variant"];
  onFiles: (files: FileList | File[]) => void;
};

/**
 * Utilitek-style OCR upload trigger.
 * Mobile: native browser sheet (Take photo / library / files).
 * Desktop + camera: menu with Take photo + Choose file.
 */
export function OcrDocumentPickerButton({
  disabled,
  multiple,
  children,
  className,
  size = "sm",
  variant = "outline",
  onFiles,
}: Props) {
  const { isMobile, cameraAvailable } = useOcrCameraAvailable();
  const { inputs, openFilePicker, openCamera } = useOcrDocumentInputRefs({
    multiple,
    disabled,
    onFiles,
  });

  const showCameraMenu = cameraAvailable && !isMobile;

  if (!showCameraMenu) {
    return (
      <>
        {inputs}
        <Button
          type="button"
          variant={variant}
          size={size}
          className={className}
          disabled={disabled}
          onClick={openFilePicker}
        >
          {children}
        </Button>
      </>
    );
  }

  return (
    <>
      {inputs}
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          render={
            <Button
              type="button"
              variant={variant}
              size={size}
              className={className}
              disabled={disabled}
            />
          }
        >
          {children}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem className="cursor-pointer" onClick={openCamera}>
            <CameraIcon className="size-4" />
            Take photo
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onClick={openFilePicker}>
            <FileUpIcon className="size-4" />
            Choose file
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/** Imperative helpers for dropzones that already manage their own click target. */
export function useOcrDocumentInputs(options: PickerOptions) {
  const { isMobile, cameraAvailable } = useOcrCameraAvailable();
  const picker = useOcrDocumentInputRefs(options);

  return {
    ...picker,
    isMobile,
    cameraAvailable,
    /** Mobile → native sheet; desktop + camera → choose file (use openCamera separately). */
    openPrimaryPicker: () => picker.openFilePicker(),
    showCameraMenu: cameraAvailable && !isMobile,
  };
}
