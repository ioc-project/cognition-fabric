// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

export interface AttributeValue {
  stringValue?: string;
  intValue?: number;
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: AttributeValue[];
  kvlistValue?: KeyValue[];
}

export interface KeyValue {
  key: string;
  value?: AttributeValue;
}

export interface Resource {
  attributes?: KeyValue[];
  droppedAttributesCount?: number;
}

export interface InstrumentationScope {
  name?: string;
  version?: string;
  attributes?: KeyValue[];
  droppedAttributesCount?: number;
}

export interface SpanStatus {
  message?: string;
  code?: number | string;
}

export interface SpanEvent {
  timeUnixNano?: string;
  name?: string;
  attributes?: KeyValue[];
  droppedAttributesCount?: number;
}

export interface Span {
  traceId?: string;
  spanId?: string;
  traceState?: string;
  parentSpanId?: string;
  name?: string;
  kind?: string | number;
  startTimeUnixNano?: string;
  endTimeUnixNano?: string;
  attributes?: KeyValue[];
  droppedAttributesCount?: number;
  events?: SpanEvent[];
  droppedEventsCount?: number;
  status?: SpanStatus;
}

export interface ScopeSpan {
  scope?: InstrumentationScope;
  spans?: Span[];
  schemaUrl?: string;
}

export interface ResourceSpan {
  resource?: Resource;
  scopeSpans?: ScopeSpan[];
  schemaUrl?: string;
}

export interface ExtractionPreprocessing {
  lowercase?: boolean;
  tokenizer?: string;
  remove_punctuation?: boolean;
}

export interface ExtractionConfig {
  use_crf?: boolean;
  confidence_threshold?: number;
  entities?: string[];
  preprocessing?: ExtractionPreprocessing;
}

export interface TemplateConfig {
  'info-extraction'?: ExtractionConfig;
  otel?: {
    resourceSpans?: ResourceSpan[];
  };
  [key: string]: unknown;
}

export interface Template {
  id: string;
  type: 'KnowledgeAdapterTemplates' | 'ReasonerTemplates' | string;
  config?: TemplateConfig;
  created_at?: string;
  updated_at?: string;
}
