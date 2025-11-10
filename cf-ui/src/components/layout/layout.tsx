import {Outlet} from 'react-router-dom';
import {NavBar} from './nav-bar';
import {SideBar} from './side-bar';
import {Container} from '@magnetic/container';
import {Helmet} from 'react-helmet-async';

export const Layout = () => {
  return (
    <div className="flex">
      <Helmet
        bodyAttributes={{
          style: 'background-color: var(--base-bg-weak-default);' as any
        }}
      />
      <NavBar />
      <SideBar />
      <div className="flex flex-1 flex-col">
        <main className="h-full overflow-y-auto pt-[56px]">
          <Container style={{borderRadius: '0', height: 'calc(100vh - 56px)', overflowY: 'auto', padding: 24}}>
            <Outlet />
          </Container>
        </main>
      </div>
    </div>
  );
};
