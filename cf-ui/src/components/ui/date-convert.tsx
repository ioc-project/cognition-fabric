import React, {useMemo} from 'react';
import {format, formatDistanceToNow} from 'date-fns';
import {safeGetDate} from '@/utils/utils';
import type {VariantProps} from 'class-variance-authority';
import {cva} from 'class-variance-authority';
import {Text} from '@magnetic/text';

// eslint-disable-next-line @typescript-eslint/no-unsafe-call
const dateHoverStyles = cva(['_date-hover inline underline decoration-dotted decoration-text-foreground cursor-default']);

export const DateConvert: React.FC<DateHoverProps> = ({className, date, useDistance = false, ...props}) => {
  const dateObj = useMemo(() => {
    try {
      return safeGetDate(date);
    } catch (e) {
      return null;
    }
  }, [date]);

  if (!date) {
    return null;
  }

  if (!dateObj) {
    // If we can't parse the date, just show the raw date. This is probably a
    // string that's not a date, like "now" or "today", or a number that's not
    // a timestamp.
    return (
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      <span className={dateHoverStyles({class: className})} {...props}>
        {props.children || (date as string | number)}
      </span>
    );
  }

  if (useDistance) {
    return (
      <Text color="light" size="p4">
        {formatDistanceToNow(dateObj, {addSuffix: true})}
      </Text>
    );
  }

  return (
    <Text color="light" size="p4" weight="bold">
      {format(dateObj, 'PPPPpppp')}
    </Text>
  );
};

interface DateHoverProps extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>, VariantProps<typeof dateHoverStyles> {
  date?: string | number | Date;
  useDistance?: boolean;
}
