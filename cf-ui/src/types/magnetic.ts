import {ElementType} from 'react';
import {PolymorphicComponentPropsWithRef} from '@magnetic/types';

type BaseTabsLinkProps = {
  children: string;
  disabled?: boolean | undefined;
  prefix?: unknown;
  selected?: boolean | undefined;
  suffix?: unknown;
};

export type TabsLinkProps<C extends ElementType = 'a'> = PolymorphicComponentPropsWithRef<C, BaseTabsLinkProps>;
