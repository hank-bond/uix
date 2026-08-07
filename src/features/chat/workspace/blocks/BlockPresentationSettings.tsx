// Provides the chat feature's durable block-presentation preferences to transcript renderers.

import {
  createContext,
  type JSX,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react";

import { useFeatureSetting } from "@uix/api/workspace";

import {
  type BlockPresentationSettings,
  chatSettings,
  type CommandLayout,
  defaultBlockPresentationSettings,
} from "../../shared/settings";

interface BlockPresentationSettingsValue {
  settings: BlockPresentationSettings;
  loading: boolean;
  error: Error | undefined;
  setCommandLayout: (layout: CommandLayout) => Promise<void>;
}

const BlockPresentationSettingsContext =
  createContext<BlockPresentationSettingsValue | null>(null);

export function BlockPresentationSettingsProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const setting = useFeatureSetting(chatSettings, "blockPresentation");
  const settings = setting.value ?? defaultBlockPresentationSettings;
  const setCommandLayout = useCallback(
    async (layout: CommandLayout) => {
      await setting.set({
        ...settings,
        command: {
          ...settings.command,
          layout,
        },
      });
    },
    [setting, settings],
  );
  const value = useMemo<BlockPresentationSettingsValue>(
    () => ({
      settings,
      loading: setting.loading,
      error: setting.error,
      setCommandLayout,
    }),
    [settings, setting.loading, setting.error, setCommandLayout],
  );

  return (
    <BlockPresentationSettingsContext.Provider value={value}>
      {children}
    </BlockPresentationSettingsContext.Provider>
  );
}

export function useBlockPresentationSettings(): BlockPresentationSettingsValue {
  const value = useContext(BlockPresentationSettingsContext);
  if (!value) {
    throw new Error("BlockPresentationSettingsProvider is missing");
  }
  return value;
}
