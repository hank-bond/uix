import { defineSettings, type SettingsDefinition } from "@uix/api/settings";
import type { Static } from "typebox";

export type WorkspaceSettingsNamespace<
  Id extends string,
  Definition extends SettingsDefinition,
> = Readonly<{ id: Id }> & Definition;

export type AnyWorkspaceSettingsNamespace = WorkspaceSettingsNamespace<
  string,
  SettingsDefinition
>;

/** Define one workspace namespace and retain its schema as its type token. */
export function defineWorkspaceSettingsNamespace<
  const Id extends string,
  const Schema extends SettingsDefinition["schema"],
>(namespace: {
  id: Id;
  schema: Schema;
  default?: Static<Schema>;
}): WorkspaceSettingsNamespace<Id, SettingsDefinition<Schema>> {
  return {
    id: namespace.id,
    ...defineSettings({
      schema: namespace.schema,
      ...(namespace.default !== undefined && { default: namespace.default }),
    }),
  };
}
