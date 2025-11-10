import {useMemo, useState} from 'react';
import {Button} from '@magnetic/button';
import {Flex} from '@magnetic/flex';
import {MagnifyingGlass, Plus} from '@magnetic/icons';
import {Input} from '@magnetic/input';
import {Nav, Icon} from '@magnetic/nav';
import {useLocation, useNavigate} from 'react-router-dom';
import {useToastContext} from '@/providers';
import {getPaths} from '@/router/paths';
import {hrItems, menuItems, organizations, productivityItems} from './mock-data';

export const SideBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const PATHS = getPaths();
  const {addToast} = useToastContext();
  const isSelected = useMemo(() => {
    return (path: string) => location.pathname.startsWith(path);
  }, [location]);

  // NOTE: this is mock data
  const [input, setInput] = useState('');
  const [selected, setSelected] = useState('Box');
  const [selectedOrg, setSelectedOrg] = useState('');
  const filteredOrg = organizations.filter((org) => org.toLowerCase().includes(input));
  const handleInputChange = (e: React.FormEvent<HTMLInputElement>) => {
    setInput(e.currentTarget.value.toLowerCase());
  };

  return (
    <div className="pt-[56px]">
      <Nav initialIsCollapsed={false} isIconOnly={false} key="nav" navZIndex={1}>
        <Nav.Collapse auto={true} />
        <Nav.Menu>
          <Nav.Item
            drawerContentId="organization"
            heading="Organization"
            icon={<Icon kind="organization-switcher" />}
            id="1"
            label={selectedOrg}
            switcher
          />
          {menuItems.map((item) => (
            <Nav.Item key={item.id} {...item} />
          ))}
          <Nav.Divider />
          <Nav.Item icon={<Icon kind="access-management" />} key="Access Management" label="Access Management" />
        </Nav.Menu>
        <Nav.Drawer key="nav-drawer">
          <Nav.Drawer.Content heading="Applications" id="applications">
            <Nav.Drawer.Item>Meraki Dashboard</Nav.Drawer.Item>
            <Nav.Drawer.Item>Webex</Nav.Drawer.Item>
            <Nav.Drawer.Item>Duo</Nav.Drawer.Item>
            <Nav.Drawer.Item>Anyconnect</Nav.Drawer.Item>
          </Nav.Drawer.Content>
          <Nav.Drawer.Content heading="Inventory Assets" id="inventory">
            <Nav.Drawer.Navigation to="internet">Software Assets</Nav.Drawer.Navigation>
            <Nav.Drawer.Navigation to="remote-access">Hardware Assets</Nav.Drawer.Navigation>
            <Nav.Drawer.Item>Data Assets</Nav.Drawer.Item>
            <Nav.Drawer.Item>Physical Security Assets</Nav.Drawer.Item>
          </Nav.Drawer.Content>
          <Nav.Drawer.Content id="home">
            <Nav.Drawer.ItemGroup label="Productivity Software">
              {productivityItems.map((item) => (
                <Nav.Drawer.Item
                  isNew={item.isNew}
                  key={item.title}
                  leadingIcon={item.prefix}
                  onClick={() => setSelected(item.title)}
                  selected={selected === item.title}
                >
                  {item.title}
                </Nav.Drawer.Item>
              ))}
            </Nav.Drawer.ItemGroup>
            <Nav.Drawer.ItemGroup label="HR Software">
              {hrItems.map((item) => (
                <Nav.Drawer.Item key={item.title} onClick={() => setSelected(item.title)} selected={selected === item.title}>
                  {item.title}
                </Nav.Drawer.Item>
              ))}
            </Nav.Drawer.ItemGroup>
          </Nav.Drawer.Content>
          <Nav.Drawer.Content id="applications">
            <Nav.Drawer.Item>User Analytics</Nav.Drawer.Item>
            <Nav.Drawer.Item>Organization Analytics</Nav.Drawer.Item>
            <Nav.Drawer.Item>Group Analytics</Nav.Drawer.Item>
            <Nav.Drawer.Item>Custom Analytics</Nav.Drawer.Item>
          </Nav.Drawer.Content>
          <Nav.Drawer.Content id="adp">
            <Nav.Drawer.Navigation to="access-control">Access Control But With Also A Very Long Title To Show Off</Nav.Drawer.Navigation>
            <Nav.Drawer.Navigation to="internet">Internet Usage</Nav.Drawer.Navigation>
            <Nav.Drawer.Navigation to="remote-access">Remote Access</Nav.Drawer.Navigation>
          </Nav.Drawer.Content>
          <Nav.Drawer.Content id="access-control">
            <Nav.Drawer.Item>Software Assets</Nav.Drawer.Item>
          </Nav.Drawer.Content>
          <Nav.Drawer.Content id="internet">
            <Nav.Drawer.Item>Internet Usage</Nav.Drawer.Item>
          </Nav.Drawer.Content>
          <Nav.Drawer.Content id="remote-access">
            <Nav.Drawer.Item>Remote Access</Nav.Drawer.Item>
          </Nav.Drawer.Content>
          <Nav.Drawer.Content id="organization">
            <Flex direction="vertical" gap={8} id="search-for-network" style={{marginBottom: '12px'}}>
              <Input label="" onChange={handleInputChange} placeholder="Search for network" prefix={<MagnifyingGlass />} />
              <Button icon={<Plus />} kind="tertiary">
                Create an organization
              </Button>
            </Flex>
            {filteredOrg.map((org) => (
              <Nav.Drawer.Item key={org} onClick={() => setSelectedOrg(org)} selected={org === selectedOrg}>
                {org}
              </Nav.Drawer.Item>
            ))}
          </Nav.Drawer.Content>
        </Nav.Drawer>
      </Nav>
    </div>
  );
};
