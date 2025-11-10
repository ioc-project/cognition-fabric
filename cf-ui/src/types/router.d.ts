import {RouteObject} from 'react-router';

type RouteMod = Omit<RouteObject, 'children'>;

export interface CustomRoute extends RouteMod {
  disabled?: boolean;
  children?: CustomRoute[];
}

export type Route = CustomRoute;
