import React, {useCallback, useMemo} from 'react';
import {Navigate} from 'react-router-dom';
import {Route} from '../types/router';
import {NodeRoute} from '@/components/router/node-route';
import {SecureRoute} from '@/components/router/secure-route';
import {Loading} from '@/components/ui/loading';
import NotFound from '@/components/router/404';
import {ToastProvider} from '@/providers/toast-provider';

const Welcome = React.lazy(() => import('../pages/welcome/welcome'));
const Dashboard = React.lazy(() => import('../pages/dashboard/dashboard'));

import {getPaths} from './paths';
import {Layout} from '@/components/layout/layout';
import {PlaceholderPageContent} from '@/components/ui/placeholder-page-content';

export const generateRoutes = (routes: Route[], isReady?: boolean): Route[] => {
  const PATHS = getPaths();

  return [
    {
      path: PATHS.welcome,
      element: (
        <NodeRoute>
          <Welcome />
        </NodeRoute>
      )
    },
    {
      path: PATHS.callBackLoading,
      element: (
        <NodeRoute>
          <Loading />
        </NodeRoute>
      )
    },
    {
      path: '/',
      element: (
        <SecureRoute redirectPath={PATHS.welcome}>
          <ToastProvider>
            <Layout />
          </ToastProvider>
        </SecureRoute>
      ),
      children: [
        {
          index: true,
          element: (
            <NodeRoute>
              <Dashboard />
            </NodeRoute>
          )
        },
        ...routes,
        {
          path: '*',
          element: !isReady ? <Loading /> : <NotFound />
        }
      ]
    }
  ];
};

export const useRoutes = () => {
  const isReady = true;
  const PATHS = getPaths();

  const routes = useMemo<Route[]>(() => {
    if (!isReady) {
      return [];
    }
    return [
      {
        path: PATHS.placeholder,
        element: (
          <NodeRoute>
            <PlaceholderPageContent />
          </NodeRoute>
        ),
        children: [
          {
            path: '*',
            element: <Navigate to={PATHS.placeholder} replace />
          }
        ]
      }
    ];
  }, [isReady, PATHS]);

  const removeDisabledRoutes = useCallback((routes: Route[]): Route[] => {
    return routes
      .filter((route) => !route.disabled)
      .map((route) => {
        if (route.children) {
          return {
            ...route,
            children: removeDisabledRoutes(route.children)
          };
        }
        return route;
      });
  }, []);

  const routesGenerated = generateRoutes(routes, isReady);

  return useMemo(() => {
    return removeDisabledRoutes(routesGenerated);
  }, [removeDisabledRoutes, routesGenerated]);
};
