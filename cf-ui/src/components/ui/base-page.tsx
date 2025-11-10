import {Flex} from '@magnetic/flex';
import {Heading, HeadingProps} from '@magnetic/heading';
import {Tabs, TabsProps} from '@magnetic/tabs';
import {Link, Outlet, useLocation} from 'react-router-dom';
import React, {ReactNode, useMemo} from 'react';
import {Text, TextProps} from '@magnetic/text';
import {Breadcrumb} from '@magnetic/breadcrumb';
import {TabsLinkProps} from '@/types/magnetic';

export const BasePage: React.FC<React.PropsWithChildren<BasePageProps>> = ({
  tabs,
  title,
  description,
  children,
  callToAction,
  descriptionProps,
  headingProps,
  breadcrumbs,
  useBreadcrumbs,
  useDefaultBreadcrumbs,
  customDescription,
  customInfo,
  ...props
}) => {
  const location = useLocation();

  const isSelected = useMemo(
    () => (path: string) => {
      return location.pathname.startsWith(path);
    },
    [location]
  );

  const defaultBreadcrumbs: BreadcrumbItem[] = [];

  if (breadcrumbs === undefined) {
    breadcrumbs = defaultBreadcrumbs;
  } else if (useDefaultBreadcrumbs) {
    breadcrumbs = [...defaultBreadcrumbs, ...breadcrumbs];
  } else {
    breadcrumbs = [...breadcrumbs];
  }

  return (
    <Flex direction="vertical" gap={12}>
      {useBreadcrumbs && (
        <Flex direction="vertical" gap={4}>
          <Breadcrumb>
            {breadcrumbs.map((breadcrumb, index) =>
              !breadcrumb.active ? (
                <Text key={index} weight="semi-bold">
                  {breadcrumb.text}
                </Text>
              ) : (
                <Link to={breadcrumb.link} key={index}>
                  <Breadcrumb.Link {...breadcrumb}>{breadcrumb.text}</Breadcrumb.Link>
                </Link>
              )
            )}
          </Breadcrumb>
        </Flex>
      )}
      <Flex direction="vertical" gap={8} justify="space-between" wrap>
        <Flex direction="horizontal" gap={8} justify="space-between" wrap align="center">
          <Flex direction="vertical" className="pb-2 space-y-1">
            <Heading size={props.kind === 'secondary' ? 'h2' : 'h1'} {...headingProps}>
              {title}
            </Heading>
            {description && (
              <Text size="p3" className="italic" {...descriptionProps}>
                {description}
              </Text>
            )}
            {customDescription && <>{customDescription}</>}
          </Flex>
          {callToAction && <div>{callToAction}</div>}
        </Flex>
        {customInfo && <>{customInfo}</>}
        {tabs && tabs.length > 0 && (
          <Tabs kind="primary" {...props}>
            {tabs.map((tab, index) =>
              tab.disable ? (
                <Tabs.Link
                  className="min-w-20 flex justify-center"
                  style={{paddingLeft: '16px', paddingRight: '16px'}}
                  {...tab}
                  selected={isSelected(tab.link)}
                  disabled={tab.disable}
                  key={index}
                >
                  {tab.title}
                </Tabs.Link>
              ) : (
                <Link to={tab.link} key={index}>
                  <Tabs.Link
                    className="min-w-20 flex justify-center"
                    style={{paddingLeft: '16px', paddingRight: '16px'}}
                    {...tab}
                    selected={isSelected(tab.link)}
                    disabled={tab.disable}
                  >
                    {tab.title}
                  </Tabs.Link>
                </Link>
              )
            )}
          </Tabs>
        )}
      </Flex>
      <Flex direction="vertical" gap={16}>
        {children ? children : <Outlet />}
      </Flex>
    </Flex>
  );
};

interface TabItem extends Omit<TabsLinkProps, 'children' | 'title'> {
  link: string;
  disable?: boolean;
  title: string;
}

interface BreadcrumbItem {
  link: string;
  text: ReactNode;
  active?: boolean;
}

interface BasePageProps extends TabsProps {
  tabs?: TabItem[];
  headingProps?: HeadingProps;
  descriptionProps?: TextProps;
  useBreadcrumbs?: boolean;
  breadcrumbs?: BreadcrumbItem[];
  title?: string;
  description?: string;
  customDescription?: ReactNode;
  useDefaultBreadcrumbs?: boolean;
  callToAction?: ReactNode;
  customInfo?: ReactNode;
}
