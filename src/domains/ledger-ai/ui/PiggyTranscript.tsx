"use client";

import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScrollerScrollable,
} from "@/components/ui/message-scroller";
import {
  PiggyMascot,
  type PiggyMood,
} from "@/domains/ledger-ai/ui/PiggyMascot";
import { UserMascot } from "@/domains/ledger-ai/ui/UserMascot";
import { PiggyMarkdown } from "@/domains/ledger-ai/ui/PiggyMarkdown";
import { cn } from "@/lib/utils";
import { Eraser } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type WheelEvent,
} from "react";
import styles from "./PiggyTranscript.module.css";
import { useCappedTextReveal } from "./useCappedTextReveal";

/** Extra wheel delta past the bottom before Clear chat peeks in. */
const OVERSCROLL_REVEAL_PX = 48;

/** Shared scroll shell for bottom Piggy and Canvas Piggy. */
export function PiggyTranscript({
  ariaLabel,
  children,
  className,
  style,
  onClearChat,
  canClearChat = false,
}: {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Clear this chat; button peeks in when the user overscrolls past the end. */
  onClearChat?: () => void;
  canClearChat?: boolean;
}) {
  return (
    <div className={cn("min-h-0 bg-background", className)} style={style}>
      <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <PiggyTranscriptScroller
          ariaLabel={ariaLabel}
          onClearChat={onClearChat}
          canClearChat={canClearChat}
        >
          {children}
        </PiggyTranscriptScroller>
      </MessageScrollerProvider>
    </div>
  );
}

function PiggyTranscriptScroller({
  ariaLabel,
  children,
  onClearChat,
  canClearChat,
}: {
  ariaLabel: string;
  children: ReactNode;
  onClearChat?: () => void;
  canClearChat: boolean;
}) {
  const scrollable = useMessageScrollerScrollable();
  const [revealed, setRevealed] = useState(false);
  const pull = useRef(0);
  const touchY = useRef<number | null>(null);
  const atEnd = !scrollable.end;

  useEffect(() => {
    if (atEnd && canClearChat) return;
    pull.current = 0;
    setRevealed(false);
  }, [atEnd, canClearChat]);

  const pullTowardClear = (delta: number) => {
    if (!onClearChat || !canClearChat || !atEnd) return;
    if (delta > 0) {
      pull.current += delta;
      if (pull.current >= OVERSCROLL_REVEAL_PX) setRevealed(true);
      return;
    }
    if (delta < 0) {
      pull.current = 0;
      setRevealed(false);
    }
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    pullTowardClear(event.deltaY);
  };

  return (
    <MessageScroller>
      <MessageScrollerViewport
        aria-label={ariaLabel}
        className="px-3 pt-3 pb-8"
        onWheel={onWheel}
        onTouchStart={(event) => {
          touchY.current = event.touches[0]?.clientY ?? null;
        }}
        onTouchMove={(event) => {
          const y = event.touches[0]?.clientY;
          if (y == null || touchY.current == null) return;
          // Finger moves up → content wants to go down → overscroll at end.
          pullTowardClear(touchY.current - y);
          touchY.current = y;
        }}
        onTouchEnd={() => {
          touchY.current = null;
        }}
      >
        <MessageScrollerContent className="gap-3">
          {children}
        </MessageScrollerContent>
      </MessageScrollerViewport>
      {onClearChat && canClearChat ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center bg-linear-to-t from-background via-background/90 to-transparent px-3 pt-6 pb-2 transition-[opacity,translate] duration-200",
            revealed
              ? "translate-y-0 opacity-100"
              : "translate-y-2 opacity-0",
          )}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "pointer-events-auto h-7 gap-1.5 rounded-full border-accent/25 bg-background/95 text-xs text-muted-foreground shadow-sm hover:bg-accent-subtle hover:text-accent",
              !revealed && "pointer-events-none",
            )}
            aria-hidden={!revealed}
            tabIndex={revealed ? 0 : -1}
            onClick={onClearChat}
          >
            <Eraser className="size-3" />
            Clear chat
          </Button>
        </div>
      ) : null}
      <MessageScrollerButton aria-label="Scroll to latest" />
    </MessageScroller>
  );
}

export function PiggyTranscriptItem({
  messageId,
  scrollAnchor = false,
  children,
}: {
  messageId: string;
  scrollAnchor?: boolean;
  children: ReactNode;
}) {
  return (
    <MessageScrollerItem messageId={messageId} scrollAnchor={scrollAnchor}>
      {children}
    </MessageScrollerItem>
  );
}

export function PiggyUserMessage({
  text,
  children,
}: {
  text: string;
  /** Extra rows under the bubble, e.g. attached document chips. */
  children?: ReactNode;
}) {
  return (
    <Message align="end" className={cn("motion-safe:animate-piggy-pop", styles.user)}>
      <MessageAvatar className="size-14 self-start overflow-visible rounded-none bg-transparent">
        <UserMascot iconClassName="size-14" />
      </MessageAvatar>
      <MessageContent className="gap-1.5">
        {text ? (
          <Bubble align="end" variant="default" className={styles.userBubble}>
            <BubbleContent className="min-w-0">
              <PiggyMarkdown text={text} />
            </BubbleContent>
          </Bubble>
        ) : null}
        {children}
      </MessageContent>
    </Message>
  );
}

export function PiggyAssistantMessage({
  children,
  mood = "still",
  className,
}: {
  children: ReactNode;
  mood?: PiggyMood;
  className?: string;
}) {
  return (
    <Message
      align="start"
      className={cn("motion-safe:animate-piggy-pop", styles.assistant, className)}
    >
      <MessageAvatar className="size-14 self-start overflow-visible rounded-none bg-transparent">
        <PiggyMascot mood={mood} iconClassName="size-14" />
      </MessageAvatar>
      <MessageContent className="gap-1.5">{children}</MessageContent>
    </Message>
  );
}

export function PiggyTextBubble({
  children,
  align = "start",
}: {
  children: ReactNode;
  align?: "start" | "end";
}) {
  return (
    <Bubble align={align} variant="piggy">
      <BubbleContent className="min-w-0">{children}</BubbleContent>
    </Bubble>
  );
}

/** Assistant reply text that types at a max speed even after the stream ends. */
export function PiggyCappedText({
  text,
  live = false,
}: {
  text: string;
  live?: boolean;
}) {
  const shown = useCappedTextReveal(text, live);
  return <PiggyMarkdown text={shown} />;
}
