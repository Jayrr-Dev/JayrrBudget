"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";

export type UserNoteRecord = {
  id: Id<"userNotes">;
  tabId: string;
  tabName: string;
  content: string;
  createdAt: number;
  updatedAt: number;
};

export function useUserNotes(): UserNoteRecord[] {
  const { isAuthenticated } = useConvexAuth();
  const data = useQuery(api.userNotes.list, isAuthenticated ? {} : "skip");
  return data ?? [];
}

export function useUserNotesActions() {
  const insertDefault = useMutation(api.userNotes.insertDefault);
  const insertTab = useMutation(api.userNotes.insertTab);
  const updateContent = useMutation(api.userNotes.updateContent);
  const renameTab = useMutation(api.userNotes.renameTab);
  const removeTab = useMutation(api.userNotes.removeTab);

  return {
    insertDefault: () => insertDefault({}),
    insertTab: () => insertTab({}),
    updateContent: (noteId: Id<"userNotes">, content: string) =>
      updateContent({ noteId, content }),
    renameTab: (noteId: Id<"userNotes">, tabName: string) =>
      void renameTab({ noteId, tabName }),
    removeTab: (noteId: Id<"userNotes">) => void removeTab({ noteId }),
  };
}

/** Seed one empty Note tab the first time the notes popover opens empty. */
export function useEnsureDefaultUserNote(open: boolean, notes: UserNoteRecord[]) {
  const actions = useUserNotesActions();
  const seeding = useRef(false);

  useEffect(() => {
    if (!open || notes.length > 0 || seeding.current) return;
    seeding.current = true;
    void actions
      .insertDefault()
      .catch(() => {
        seeding.current = false;
      });
  }, [actions, notes.length, open]);
}
