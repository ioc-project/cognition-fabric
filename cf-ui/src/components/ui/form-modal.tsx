'use client';

import {ReactNode} from 'react';
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
  submitButtonVariant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'sidebar';
  children: (form: UseFormReturn<TFieldValues>) => ReactNode;
  contentClassName?: string;
  formId?: string;
  isLoading?: boolean;
  onInteractOutside?: (event: Event) => void;
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
  submitButtonVariant = 'sidebar',
  children,
  contentClassName = 'sm:max-w-[480px] p-6 gap-4',
  formId,
  isLoading = false,
  onInteractOutside,
  errorFieldName
}: FormModalProps<TFieldValues>) {
  const form = useForm<TFieldValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues as any
  });

  const generatedFormId = formId || `form-modal-${title.toLowerCase().replace(/\s+/g, '-')}`;

  const handleSubmit = async (values: TFieldValues) => {
    try {
      await onSubmit(values);
      form.reset();
    } catch (error) {
      const errorMessage = parseError(error);
      const fieldName = errorFieldName || (Object.keys(defaultValues)[0] as keyof TFieldValues);
      form.setError(fieldName as any, {
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

  const handleInteractOutside = onInteractOutside || ((e: Event) => e.preventDefault());

  const footer = (
    <div className="flex w-full items-center justify-between">
      <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
        Cancel
      </Button>
      <Button type="submit" form={generatedFormId} disabled={form.formState.isSubmitting || isLoading} variant={submitButtonVariant}>
        {form.formState.isSubmitting ? 'Submitting...' : submitLabel}
      </Button>
    </div>
  );

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      description={description}
      onInteractOutside={handleInteractOutside}
      contentClassName={contentClassName}
      footer={footer}
    >
      <Form {...form}>
        <form id={generatedFormId} onSubmit={form.handleSubmit(handleSubmit as any)} className="space-y-4 py-4">
          {children(form as any)}
        </form>
      </Form>
    </Modal>
  );
}
