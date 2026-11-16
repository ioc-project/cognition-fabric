// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import {ReactNode, useEffect} from 'react';
import {useForm, UseFormReturn, FieldValues} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
import {Form} from '@/components/ui/form';
import {parseError} from '@/lib/utils';

interface FormModalProps<TFieldValues extends FieldValues> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  schema: z.ZodSchema<TFieldValues>;
  defaultValues: TFieldValues;
  onSubmit: (values: TFieldValues) => Promise<void>;
  submitLabel: string;
  loadingLabel?: string;
  submitButtonVariant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'sidebar';
  children: (form: UseFormReturn<TFieldValues>) => ReactNode;
  contentClassName?: string;
  formId?: string;
  isLoading?: boolean;
  onInteractOutside?: (event: Event | React.SyntheticEvent) => void;
  errorFieldName?: keyof TFieldValues;
}

export function FormModal<TFieldValues extends FieldValues>({
  open,
  onOpenChange,
  title,
  description,
  schema,
  defaultValues,
  onSubmit,
  submitLabel,
  loadingLabel,
  submitButtonVariant = 'sidebar',
  children,
  contentClassName = 'sm:max-w-[480px] p-6 gap-4',
  formId,
  isLoading = false,
  onInteractOutside,
  errorFieldName: _errorFieldName
}: FormModalProps<TFieldValues>) {
  const form = useForm<TFieldValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues as any
  });

  useEffect(() => {
    if (open) {
      form.reset(defaultValues);
    }
  }, [open, defaultValues, form]);

  const generatedFormId = formId || `form-modal-${title.toLowerCase().replace(/\s+/g, '-')}`;

  const handleSubmit = async (values: TFieldValues) => {
    try {
      await onSubmit(values);
      form.reset();
      onOpenChange(false);
    } catch (error) {
      const errorMessage = parseError(error);
      form.setError('root', {
        type: 'manual',
        message: errorMessage
      });
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      form.reset();
    }
    onOpenChange(open);
  };

  const handleInteractOutside = onInteractOutside;

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      description={description}
      onInteractOutside={handleInteractOutside}
      onOpenAutoFocus={(e) => e.preventDefault()}
      contentClassName={contentClassName}
    >
      <Form {...form}>
        <form id={generatedFormId} onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
          {form.formState.errors.root && (
            <div className="p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md">
              {form.formState.errors.root.message}
            </div>
          )}
          {children(form)}
          <div className="flex w-full items-center justify-between pt-4">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting || isLoading} variant={submitButtonVariant}>
              {form.formState.isSubmitting ? loadingLabel || 'Submitting...' : submitLabel}
            </Button>
          </div>
        </form>
      </Form>
    </Modal>
  );
}
