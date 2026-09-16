import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Props = {
  src: string | null;
  name: string;
  size?: "inline" | "sm" | "default" | "lg";
};

export function MerchantLogoAvatar({ src, name, size = "default" }: Props) {
  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  return (
    <Avatar
      size={size === "inline" ? "default" : size}
      className={cn(size === "inline" && "size-[1lh] after:hidden")}
    >
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback className={cn(size === "inline" && "text-[0.65em]")}>
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}
