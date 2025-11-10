import {Empty} from '@magnetic/icons';
import {Text} from '@magnetic/text';
import type {ReactNode} from 'react';
import React from 'react';

const EmptyOrErrorListState: React.FC<EmptyOrErrorListStateProps> = ({title, description, icon, actions, ...props}) => {
  return (
    <div className="flex items-center flex-col gap-2 text-muted-foreground text-center" {...props}>
      <div>{icon ?? <Empty.Info className="w-14 h-14 aspect-square" />}</div>
      <Text size="h2" className="font-semibold text-foreground">
        {title}
      </Text>
      {description && <Text className="font-normal text-sm mb-4">{description}</Text>}
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
};

export interface EmptyOrErrorListStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  description?: ReactNode;
  actions?: ReactNode;
  title: ReactNode;
  icon?: ReactNode;
}

export default EmptyOrErrorListState;
