"use client";

import { Bubble, BubbleContent } from "@/components/ui/bubble";
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
} from "@/components/ui/message-scroller";
import {
  PiggyMascot,
  type PiggyMood,
} from "@/domains/ledger-ai/ui/PiggyMascot";
import { UserMascot } from "@/domains/ledger-ai/ui/UserMascot";
import { PiggyMarkdown } from "@/domains/ledger-ai/ui/PiggyMarkdown";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import styles from "./PiggyTranscript.module.css";
import { useCappedTextReveal } from "./useCappedTextReveal";

/** Shared scroll shell for bottom Piggy and Canvas Piggy. */
export function PiggyTranscript({
  ariaLabel,
  children,
  className,
}: {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-h-0 bg-background", className)}>
      <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <MessageScroller>
          <MessageScrollerViewport
            aria-label={ariaLabel}
            className="px-3 py-3"
          >
            <MessageScrollerContent className="gap-3">
              {children}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton aria-label="Scroll to latest" />
        </MessageScroller>
      </MessageScrollerProvider>
    </div>
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

export function PiggyUserMessage({ text }: { text: string }) {
  return (
    <Message align="end" className={cn("motion-safe:animate-piggy-pop", styles.user)}>
      <MessageAvatar className="size-14 self-start overflow-visible rounded-none bg-transparent">
        <UserMascot iconClassName="size-14" />
      </MessageAvatar>
      <MessageContent>
        <Bubble align="end" variant="default" className={styles.userBubble}>
          <BubbleContent className="min-w-0">
            <PiggyMarkdown text={text} />
          </BubbleContent>
        </Bubble>
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
