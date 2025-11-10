import {useMemo} from 'react';
import {createBrowserRouter, RouteObject, RouterProvider} from 'react-router-dom';
import {useRoutes} from './routes';

export const Router = () => {
  const routes = useRoutes() as RouteObject[];
  const router = useMemo(() => createBrowserRouter(routes), [routes]);
  return <RouterProvider router={router} />;
};
