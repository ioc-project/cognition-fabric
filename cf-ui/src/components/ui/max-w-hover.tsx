/*!
 * Copyright (c) 2024 Cisco and/or its affiliates.
 *
 * PROPRIETARY AND CONFIDENTIAL - ALL USE MUST BE LICENSED
 *
 * The code, technical concepts, all information contained herein and related
 * documentation are the property of, proprietary to and are vested in Cisco
 * Technology, Inc. and/or its affiliated entities, ("Cisco") under various
 * laws including copyright, international treaties, patent, trade secret
 * and/or contract. Any copying, dissemination, reverse engineering, disclosure
 * or other use of the material contained herein without an express license
 * from Cisco is prohibited and, among other legal consequences, constitutes an
 * infringement of the intellectual property and the proprietary rights of
 * Cisco. All use of the material herein must be in strict accordance with the
 * terms of the license you have entered into with Cisco.
 */

/* eslint-disable react/prop-types */
import {Text, TextProps} from '@magnetic/text';
import {cn} from '@/utils/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {Popover} from '@magnetic/popover';

interface MaxWHoverProps extends TextProps {
  content: string;
  description?: string;
  className?: string;
  useMarkdown?: boolean;
}

export const MaxWHover: React.FC<MaxWHoverProps> = ({content, description, useMarkdown = false, className, ...props}) => {
  const defaultMaxW = 'max-w-[10em]';
  const maxw = className?.split(' ').find((c) => c.startsWith('max-w-')) || defaultMaxW;
  const classNamesWithoutMaxW = className
    ?.split(' ')
    .filter((c) => !c.startsWith('max-w-'))
    .join(' ');

  if (useMarkdown) {
    return (
      <Popover
        title={
          <ReactMarkdown className="text-[14px] prose dark:prose-invert" remarkPlugins={[remarkGfm]}>
            {description ? description : content}
          </ReactMarkdown>
        }
      >
        <div
          className={cn('whitespace-nowrap overflow-hidden underline decoration-dotted cursor-default truncate w-fit', classNamesWithoutMaxW, maxw)}
        >
          <Text ellipsis {...props}>
            {content ? content : description}
          </Text>
        </div>
      </Popover>
    );
  }

  return (
    <Popover title={<div className="max-w-xl max-h-64">{content}</div>}>
      <div className={cn('whitespace-nowrap overflow-hidden underline decoration-dotted cursor-default truncate w-fit', classNamesWithoutMaxW, maxw)}>
        <Text ellipsis {...props}>
          {content}
        </Text>
      </div>
    </Popover>
  );
};
