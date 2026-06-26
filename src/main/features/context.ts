// feature activation context.
//
// This is the small service bag handed to bundled/default features while the
// substrate is being decomposed into contribution facets. It is not a full
// extension host API yet.

import type { FeatureChannelPublisher } from "@uix/api/channels";
import type { DocumentStoreProvider } from "../documents/store";

export type FeatureContext = {
  documents: DocumentStoreProvider;
  channels: FeatureChannelPublisher;
};
