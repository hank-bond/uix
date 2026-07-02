// feature activation context.
//
// This is the small service bag handed to bundled/default features while the
// substrate is being decomposed into contribution facets. It is not a full
// extension host API yet.

import type { FeatureEventPublisherFactory } from "@uix/api/channels";
import type { DocumentStoreFactory } from "../documents/store";

export type FeatureContext = {
  documents: DocumentStoreFactory;
  channels: FeatureEventPublisherFactory;
};
