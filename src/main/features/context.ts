// feature activation context.
//
// This is the small service bag handed to bundled/default features while the
// substrate is being decomposed into contribution facets. It is not a full
// extension host API yet.

import type { ChannelPublisher } from "../channels/registry";
import type { DocumentStoreProvider } from "../documents/store";

export interface FeatureContext {
  documents: DocumentStoreProvider;
  channels: ChannelPublisher;
}
