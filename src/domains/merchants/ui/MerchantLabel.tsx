"use client";

import { MerchantLogoAvatar } from "@/domains/merchants/ui/MerchantLogoAvatar";
import { useMerchantLogoMap } from "@/domains/merchants/ui/useMerchantLogoMap";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  src?: string | null;
  lookupName?: string | null;
  className?: string;
};

export function MerchantLabel({ name, src, lookupName, className }: Props) {
  const logos = useMerchantLogoMap();
  const logo =
    src ||
    (lookupName ? logos.get(lookupName) : undefined) ||
    logos.get(name) ||
    null;
  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1.5",
        className,
      )}
      title={name}
    >
      {logo ? (
        <MerchantLogoAvatar src={logo} name={lookupName ?? name} size="inline" />
      ) : null}
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}
