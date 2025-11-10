import {ErrorBoundary} from 'react-error-boundary';
import {ErrorPage} from './components/router/error-page';
import {HelmetProvider} from 'react-helmet-async';
import {ApiProvider, AuthProvider, QueryProvider, SegmentProvider} from './providers';
import {Router} from './router/router';
import {useThemeStore} from './store';
import {setTheme} from '@magnetic/theme';
import {useShallow} from 'zustand/react/shallow';
import {useEffect} from 'react';

const App = () => {
  const {theme} = useThemeStore(useShallow((store) => ({theme: store.theme})));

  useEffect(() => {
    setTheme(theme);
  }, []);

  return (
    <ErrorBoundary fallbackRender={(props) => <ErrorPage {...props} />}>
      <HelmetProvider>
        <AuthProvider>
          <SegmentProvider>
            <QueryProvider>
              <ApiProvider>
                <Router />
              </ApiProvider>
            </QueryProvider>
          </SegmentProvider>
        </AuthProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
};

export default App;
