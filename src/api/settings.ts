// the settings scope contract.
//
// `defineSettings` closes a definition's schema so unknown persisted keys fail
// validation; handles expose scoped get, set, and change subscription.

import { type Static, type TObject, type TRecord, Type } from "typebox";

export const FeatureSettingAddressSchema = Type.Object({
  featureId: Type.String(),
  key: Type.String(),
});
export type FeatureSettingAddress = Static<typeof FeatureSettingAddressSchema>;

export const FeatureSettingValueEnvelopeSchema = Type.Object({
  featureId: Type.String(),
  key: Type.String(),
  value: Type.Unknown(),
});
export type FeatureSettingValueEnvelope = Static<
  typeof FeatureSettingValueEnvelopeSchema
>;

/**
 * One complete settings scope. The schema must describe an object; `default`
 * is a complete valid scope value whose missing fields hydrate persisted data.
 */
type SettingsSchema = TObject | TRecord;

export interface SettingsDefinition<
  Schema extends SettingsSchema = SettingsSchema,
> {
  readonly schema: Schema;
  readonly default?: Static<Schema>;
}

/**
 * Defines one settings scope and closes its object schema. A `Type.Object`
 * schema gives the scope named keys; a `Type.Record` schema gives it dynamic,
 * schema-validated keys without introducing a second settings concept.
 */
export function defineSettings<const Schema extends SettingsSchema>(
  definition: SettingsDefinition<Schema>,
): SettingsDefinition<Schema> {
  if (!Type.IsObject(definition.schema) && !Type.IsRecord(definition.schema)) {
    throw new Error("Settings schema must be a Type.Object or Type.Record");
  }
  return {
    ...definition,
    schema: toClosedSettingsSchema(definition.schema),
  };
}

function toClosedSettingsSchema<Schema extends SettingsSchema>(
  schema: Schema,
): Schema {
  const schemaObject: object = schema;
  const prototype = Object.getPrototypeOf(schemaObject) as object | null;
  // Unknown persisted keys must fail validation rather than survive as
  // silently ignored configuration.
  return Object.create(prototype, {
    ...Object.getOwnPropertyDescriptors(schemaObject),
    additionalProperties: {
      configurable: true,
      enumerable: true,
      value: false,
      writable: true,
    },
  }) as Schema;
}

/**
 * Scope-bound settings view — the same shape whether the scope is a
 * manifest feature entry or a substrate-owned workspace namespace.
 */
export interface SettingsHandle {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T is inferred from the call-site context (e.g. `getFavoriteModels(): ModelRef[]`); inlining to unknown would force casts at every consumer.
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  onChange(key: string, handler: (value: unknown) => void): () => void;
}

export type SettingsValues<Definition extends SettingsDefinition> = Static<
  Definition["schema"]
>;

/** A scope handle whose keys and values derive from its settings definition. */
export interface SettingsHandleFrom<Definition extends SettingsDefinition> {
  get<Key extends Extract<keyof SettingsValues<Definition>, string>>(
    key: Key,
  ): SettingsValues<Definition>[Key] | undefined;
  set<Key extends Extract<keyof SettingsValues<Definition>, string>>(
    key: Key,
    value: Exclude<SettingsValues<Definition>[Key], undefined>,
  ): void;
  onChange<Key extends Extract<keyof SettingsValues<Definition>, string>>(
    key: Key,
    handler: (value: SettingsValues<Definition>[Key] | undefined) => void,
  ): () => void;
}
