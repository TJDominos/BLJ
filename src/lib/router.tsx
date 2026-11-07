import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';

interface RouteState {
  routePath: string;
}

interface RouterContextValue {
  routeState: RouteState;
  navigate: (to: string, options?: { replace?: boolean }) => void;
  params: Record<string, string>;
}

const RouterContext = createContext<RouterContextValue>({
  routeState: { routePath: '/' },
  navigate: () => {},
  params: {},
});

const ParamsContext = createContext<Record<string, string>>({});

export function BrowserRouter({ children }: { children: React.ReactNode }) {
  const [routePath, setRoutePath] = useState<string>('/');

  const navigate = useCallback((to: string, _options?: { replace?: boolean }) => {
    const normalized = to.startsWith('/') ? to : `/${to}`;
    setRoutePath(normalized);
  }, []);

  const value = useMemo(
    () => ({
      routeState: { routePath },
      navigate,
      params: {},
    }),
    [routePath, navigate]
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useLocation(): RouteState {
  return useContext(RouterContext).routeState;
}

export function useNavigate() {
  return useContext(RouterContext).navigate;
}

export function useParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>(): T {
  return useContext(ParamsContext) as T;
}

export interface RouteProps {
  path: string;
  element: React.ReactNode;
}

export function Route(_props: RouteProps): React.ReactElement | null {
  return null;
}

function matchPath(pattern: string, routePath: string): Record<string, string> | null {
  if (pattern === '*') return {};
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = routePath.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const pat = patternParts[i];
    const seg = pathParts[i];
    if (pat.startsWith(':')) {
      params[pat.slice(1)] = decodeURIComponent(seg);
    } else if (pat !== seg) {
      return null;
    }
  }
  return params;
}

export function Routes({ children }: { children: React.ReactNode }) {
  const { routeState } = useContext(RouterContext);
  const childArray = React.Children.toArray(children);

  for (const child of childArray) {
    if (!React.isValidElement<RouteProps>(child)) continue;
    const { path, element } = child.props;
    if (typeof path !== 'string') continue;
    const matchedParams = matchPath(path, routeState.routePath);
    if (matchedParams !== null) {
      return <ParamsContext.Provider value={matchedParams}>{element}</ParamsContext.Provider>;
    }
  }

  return null;
}

export function Navigate({ to, replace }: { to: string; replace?: boolean }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace });
  }, [navigate, to, replace]);
  return null;
}
