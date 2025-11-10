import {useEffect, useState} from 'react';
import {Flex} from '@magnetic/flex';
import {Heading} from '@magnetic/heading';
import {Modal, ModalProps} from '@magnetic/modal';
import {Button} from '@magnetic/button';
import {Text} from '@magnetic/text';
import {CopyToClipboard} from '@magnetic/copy-to-clipboard';

export const ContentModal: React.FC<ContentModalProps> = ({title, rawContent, isOpen, copyContent = false, toggle, ...props}) => {
  const [content, setContent] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!rawContent) {
      return;
    }
    setContent(rawContent);
  }, [rawContent]);

  if (!content) {
    return null;
  }

  return (
    <Modal isOpen={isOpen} {...props}>
      <Flex direction="vertical">
        <div className="flex justify-between mb-4">
          <Heading as="h2" size="primary">
            {title}
          </Heading>
          {copyContent && content && <CopyToClipboard.IconOnly value={content} />}
        </div>
        <Modal.Content style={{marginBottom: 24, maxHeight: '100%'}}>
          <Text size="p2">{content}</Text>
        </Modal.Content>
        <Flex justify="flex-end">
          <Button.Group>
            <Button kind="tertiary" onClick={toggle}>
              Close
            </Button>
          </Button.Group>
        </Flex>
      </Flex>
    </Modal>
  );
};

interface ContentModalProps extends ModalProps {
  title: string;
  rawContent?: string;
  copyContent?: boolean;
  toggle: () => void;
}
