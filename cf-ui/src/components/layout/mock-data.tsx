import React from 'react';
import {Link} from '@magnetic/icons';
import {Icon} from '@magnetic/nav';

export const menuItems = [
  {
    id: '1',
    drawerContentId: 'home',
    isSelected: true,
    icon: <Icon kind="home" />,
    label: 'Home'
  },
  {
    id: '2',
    drawerContentId: 'applications',
    icon: <Icon kind="applications" />,
    isNew: true,
    label: 'Applications'
  },
  {
    id: '3',
    drawerContentId: 'inventory',
    icon: <Icon kind="inventory" />,
    label: 'Inventory'
  },
  {
    id: '4',
    icon: <Icon kind="analytics" />,
    label: 'Analytics',
    as: 'a',
    href: '#'
  }
];

export const menuLongItems = [
  {
    drawerContentId: 'organization',
    heading: 'Organization',
    icon: <Icon kind="organization-switcher" />,
    label: 'This Is A Very Long Switcher That Should Only Go Up To 3 Lines maximum',
    switcher: true
  },
  {
    drawerContentId: 'home',
    isSelected: true,
    icon: <Icon kind="home" />,
    label: 'A Very Long Nav Item That Is 3 Lines Maxium'
  },
  {
    drawerContentId: 'applications',
    icon: <Icon kind="applications" />,
    isNew: true,
    label: 'Applications'
  },
  {
    drawerContentId: 'inventory',
    icon: <Icon kind="inventory" />,
    label: 'Inventory'
  },
  {
    icon: <Icon kind="analytics" />,
    label: 'Analytics',
    as: 'a',
    href: '#'
  }
];

export const productivityItems = [
  {
    title: 'This super long sub-item is an extreme case that will go a maximum of three lines before truncating.'
  },
  {title: 'Notion', isNew: true},
  {
    title: 'Microsoft 365',
    prefix: <Link color="var(--control-icon-weak-default)" />,
    href: 'www.google.com'
  },
  {title: 'Dropbox'},
  {title: 'Trello'},
  {title: 'Box'}
];
export const hrItems = [{title: 'Workday'}, {title: 'Gusto'}, {title: '15Five'}, {title: 'ADP'}];
export const organizations = [
  'Acme Organization',
  'First Organization',
  'Second Organization',
  'Third Organization',
  'Fourth Organization',
  'Fifth Organization',
  'Sixth Organization',
  'Seventh Organization',
  'Eight Organization',
  'Ninth Organization',
  'Tenth Organization'
];

export const networks = [
  {
    title: 'MR Insight r27'
  },
  {
    title: 'SBC Core Network'
  },
  {
    title: 'cameraz'
  },
  {
    title: 't-ericn-template-child-combined'
  },
  {
    title: 't-ericn-devel'
  },
  {
    title: 't-ericn-bewcire-noisy-devel-cloned'
  },
  {
    title: 'MX'
  },
  {
    title: 'SCEP'
  },
  {
    title: 't-ericn-sm'
  },
  {
    title: 'MR Insight Random Corp APs'
  },
  {
    title: 'gatewayz'
  }
];
