// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {useForm, type FieldPath} from 'react-hook-form';
import type {MultiAgenticSystem} from '@/api/endpoints/mas';
import type {FormValues} from '@/components/mas/mas-form-schema';
import {
  applyTopologyText,
  jsonObject,
  mergeFormRequest,
  parseRequestDraft,
  pendingTopologyKey,
  formUpdateRequest,
  requestErrorIssues,
  requestFormField,
  requestToForm,
  seedUpdateRequest,
  topologyText,
  type RequestObject
} from '@/components/mas/mas-request-draft';

const stringify = (value: unknown) => JSON.stringify(value, null, 2);

export function useMASRequestDraft(workspaceId: string) {
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [json, setJson] = useState('{}');
  const [topologyJSON, setTopologyJSON] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [topologyError, setTopologyError] = useState<string | null>(null);
  const value = useRef<RequestObject>({});
  const savedRequest = useRef<RequestObject>({});
  const topologyEdited = useRef(false);
  const seededId = useRef<string | undefined>(undefined);
  const baseline = useRef(requestToForm({}));
  const form = useForm<FormValues>({defaultValues: baseline.current});

  useEffect(() => {
    const subscription = form.watch((_values, {name}) => {
      if (name) {
        form.clearErrors(name);
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const clearErrors = () => {
    form.clearErrors();
    setError(null);
    setTopologyError(null);
  };

  const reportError = (cause: unknown) => {
    clearErrors();
    setError(cause instanceof Error ? cause.message : 'Invalid request');
    if (mode !== 'form') {
      return;
    }
    const messages = new Map<string, string[]>();
    const topologyMessages: string[] = [];
    const current = form.getValues();
    for (const issue of requestErrorIssues(cause)) {
      if (issue.path[0] === 'topologies') {
        topologyMessages.push(issue.message);
        continue;
      }
      const field = requestFormField(issue.path, current);
      if (field) {
        messages.set(field, [...(messages.get(field) ?? []), issue.message]);
      }
    }
    for (const [field, errors] of messages) {
      form.setError(field as FieldPath<FormValues>, {type: 'validate', message: errors.join('\n')});
    }
    if (topologyMessages.length) {
      setTopologyError(topologyMessages.join('\n'));
    }
  };

  const reset = useCallback(
    (saved?: MultiAgenticSystem) => {
      const next = saved ? seedUpdateRequest(saved) : {};
      savedRequest.current = next;
      value.current = next;
      seededId.current = saved?.id;
      baseline.current = requestToForm(next, saved);
      form.reset(baseline.current);
      setJson(stringify(next));
      setTopologyJSON(topologyText(next));
      topologyEdited.current = false;
      setMode('form');
      setError(null);
      setTopologyError(null);
    },
    [form, workspaceId]
  );

  const read = useCallback(() => {
    const next =
      mode === 'json'
        ? jsonObject(json)
        : applyTopologyText(mergeFormRequest(value.current, form.getValues(), baseline.current), topologyJSON, topologyEdited.current);
    return mode === 'form' && seededId.current ? formUpdateRequest(next, savedRequest.current) : next;
  }, [mode, json, form, topologyJSON]);

  const switchMode = (nextMode: 'form' | 'json', saved?: MultiAgenticSystem) => {
    if (nextMode === mode) {
      return;
    }
    try {
      // Mode changes preserve incomplete/unsupported draft fields. Require only
      // valid JSON and safely projectable containers here; validate on Save.
      const next =
        mode === 'form'
          ? applyTopologyText(mergeFormRequest(value.current, form.getValues(), baseline.current), topologyJSON, topologyEdited.current)
          : parseRequestDraft(json);
      value.current = next;
      baseline.current = requestToForm(next, saved);
      form.reset(baseline.current);
      setJson(stringify(next));
      setTopologyJSON(topologyText(next));
      topologyEdited.current = false;
      setMode(nextMode);
      setError(null);
      setTopologyError(null);
    } catch (cause) {
      reportError(cause);
    }
  };

  const changeTopology = (text: string) => {
    setTopologyJSON(text);
    topologyEdited.current = true;
    setTopologyError(null);
  };

  const clearLegacyRecovery = (masId: string) => {
    try {
      sessionStorage.removeItem(pendingTopologyKey(workspaceId, masId));
    } catch {
      /* Storage is optional. */
    }
  };

  return {
    form,
    mode,
    json,
    setJson,
    topologyJSON,
    changeTopology,
    error,
    topologyError,
    clearErrors,
    reportError,
    reset,
    seededId,
    read,
    switchMode,
    clearLegacyRecovery
  };
}
