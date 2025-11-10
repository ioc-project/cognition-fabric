import {ReactNode} from 'react';
import {useForm} from 'react-hook-form';
import {z} from 'zod';
import {Modal, ModalProps} from '@magnetic/modal';
import {Flex} from '@magnetic/flex';
import {Negative, Info} from '@magnetic/icons';
import {Heading} from '@magnetic/heading';
import {Button} from '@magnetic/button';
import {Text} from '@magnetic/text';
import {zodResolver} from '@hookform/resolvers/zod';
import {DeleteConfirmSchema} from '@/schemas/delete-confirm';
import {Input} from '@magnetic/input';

interface ConfirmModalProps extends ModalProps {
  mode?: 'delete' | 'confirm';
  title: ReactNode;
  description?: ReactNode;
  onConfirm?: () => void;
  onCancel?: () => void;
  textToMatch?: string;
  triggerDisabled?: boolean;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  title,
  description,
  onConfirm,
  onCancel,
  mode = 'delete',
  textToMatch = 'DELETE',
  isOpen,
  ...props
}) => {
  const form = useForm<z.infer<typeof DeleteConfirmSchema>>({
    resolver: zodResolver(DeleteConfirmSchema),
    defaultValues: {
      text: ''
    },
    mode: 'all'
  });

  const onSubmit = (data: z.infer<typeof DeleteConfirmSchema>) => {
    if (data.text !== textToMatch) {
      form.setError('text', {message: ''});
      return;
    }
    form.reset();
    onConfirm?.();
  };

  const onClickConfirm = () => {
    onConfirm?.();
  };

  return (
    <Modal isOpen={isOpen} {...props}>
      <Flex direction="vertical">
        <Flex align="center" gap={12} margin={{bottom: 16}}>
          {mode === 'delete' ? <Negative height={24} style={{marginTop: -2}} width={24} /> : <Info height={24} style={{marginTop: -2}} width={24} />}
          <Heading as="h2" size="primary">
            {title}
          </Heading>
        </Flex>
        {description && <Text size="p2">{description}</Text>}
        {mode === 'delete' && (
          <div className="mt-4">
            <Text>
              <span>
                Type &quot;
                <code className="text-destructive text-bold">{textToMatch}</code>&quot; below to confirm
              </span>
            </Text>
            <Input label="" invalid={Boolean(form.formState.errors.text)} {...form.register('text')} />
          </div>
        )}
        <Flex justify="flex-end" className="mt-4">
          <Button.Group>
            <Button
              kind="tertiary"
              onClick={() => {
                if (mode === 'delete') {
                  form.reset();
                }
                onCancel?.();
              }}
            >
              Cancel
            </Button>
            <Button destructive={mode === 'delete'} onClick={mode === 'delete' ? form.handleSubmit(onSubmit) : onClickConfirm}>
              {mode === 'delete' ? 'Delete' : 'Confirm'}
            </Button>
          </Button.Group>
        </Flex>
      </Flex>
    </Modal>
  );
};

export default ConfirmModal;
