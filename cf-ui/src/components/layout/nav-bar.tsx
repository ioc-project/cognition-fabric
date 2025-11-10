import {Header} from '@magnetic/header';
import {useAuth} from '@/hooks';
import CiscoLogo from '@/assets/images/cisco-logo.svg?react';
import {Lightning, QuestionMark, PaintBrushHousehold, Sun, Moon, IconProps} from '@magnetic/icons';
import {Tag} from '@magnetic/tag';
import {setTheme, Themes} from '@magnetic/theme';
import {ViewSwitcher} from '@magnetic/view-switcher';
import {ForwardRefExoticComponent, useMemo} from 'react';
import {Divider} from '@magnetic/divider';
import {useThemeStore} from '@/store';
import {AuthContextIAM} from '@outshift/auth-providers-react';
import {isMultiTenant} from '@/utils/getAuthConfig';
import {Link} from 'react-router-dom';
import {getPaths} from '@/router/paths';
import {Container} from '@magnetic/container';
import {Flex} from '@magnetic/flex';
import {Skeleton} from '@magnetic/skeleton';

export const NavBar = () => {
  const {authInfo, logout, switchTenant} = useAuth() as AuthContextIAM;

  const {theme, setThemeStore, cleanThemeStore} = useThemeStore((store) => ({
    theme: store.theme,
    setThemeStore: store.setTheme,
    cleanThemeStore: store.cleanThemeStore
  }));

  const PATHS = getPaths();

  const optionsTheme: {icon: ForwardRefExoticComponent<IconProps>; value: keyof Themes}[] = [
    {
      icon: Sun,
      value: 'light'
    },
    {
      icon: Moon,
      value: 'dark'
    }
  ];

  const profile = useMemo(() => {
    if (isMultiTenant) {
      return {
        heading: authInfo?.user?.name || authInfo?.user?.username?.split('@')[0] || 'User',
        subHeading: authInfo?.user?.tenant?.name || 'Tenant'
      };
    }
    return {
      heading: authInfo?.user?.name || authInfo?.user?.username?.split('@')[0] || 'User'
    };
  }, [authInfo]);

  const onChangeTheme = (value: keyof Themes) => {
    setThemeStore(value);
    setTheme(value);
  };

  const handleLogout = () => {
    logout?.();
    cleanThemeStore();
  };

  const handleChangeTenant = () => {
    switchTenant?.();
  };

  return (
    <Header
      logo={
        <div className="flex items-center">
          <CiscoLogo className="w-11 h-11 fill-white" />
          <Divider
            direction="vertical"
            style={{
              height: '20px',
              marginRight: '5px'
            }}
            size="sm"
          />
        </div>
      }
      productName="<Name Project>"
      href={PATHS.dashboard}
      profileAndTenant={{
        icon: 'user',
        profile: profile,
        content: (
          <Header.UserProfile
            profile={{
              user: {email: authInfo?.user?.username || 'User', name: authInfo?.user?.name || 'User'},
              onLogout: handleLogout
            }}
            organization={
              isMultiTenant
                ? {
                    organization: {
                      name: authInfo?.user?.tenant?.name || 'Tenant'
                    },
                    sectionLabel: 'Tenant',
                    onChange: handleChangeTenant
                  }
                : undefined
            }
          >
            <Header.UserProfile.Section icon={Lightning} secondaryColumn={<Tag.Status status="positive">Online</Tag.Status>} title="System status" />
            <Header.UserProfile.Section
              icon={PaintBrushHousehold}
              secondaryColumn={<ViewSwitcher onChange={(value) => onChangeTheme(value as keyof Themes)} options={optionsTheme} value={theme} />}
              title="Theme"
            />
            <Header.UserProfile.Section.Menu icon={QuestionMark} links={[{href: '#help', label: 'Get help'}]} title="Support" />
          </Header.UserProfile>
        )
      }}
      style={{zIndex: 970}}
      showXPN="meraki"
      xpnLabel="Cisco Networking Cloud"
    >
      <Header.Search label="Example Search" panel>
        <Container style={{width: 500}}>
          <Flex direction="vertical" gap="md">
            <Skeleton height="lg" />
            <Skeleton height="md" />
            <Skeleton height="sm" />
            <Skeleton height={72} />
          </Flex>
        </Container>
      </Header.Search>
      <Header.Menu icon="question" label="Help">
        <Header.MenuItem href="https://magnetic-react.cisco.com" label="Get Help" />
        <Header.MenuItem href="https://magnetic-react.cisco.com" label="Community" />
        <Header.MenuItem href="https://magnetic-react.cisco.com" label="Marketplace" />
        <Header.MenuItem href="https://magnetic-react.cisco.com" label="Cases" />
        <Header.MenuItem href="https://magnetic-react.cisco.com" label="Data protection requests" />
        <Header.MenuItem href="https://magnetic-react.cisco.com" label="New features" />
        <Header.MenuItem href="https://magnetic-react.cisco.com" label="Firewall Info" />
        <Header.MenuItem href="https://magnetic-react.cisco.com" label="API docs" />
        <Header.MenuItem href="https://magnetic-react.cisco.com" label="Hardware requirements" />
      </Header.Menu>
      <Header.Button alert={100} icon="bell" label="Example Dropdown" onClick={console.log} />
    </Header>
  );
};
