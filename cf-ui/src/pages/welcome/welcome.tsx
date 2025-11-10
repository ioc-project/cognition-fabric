import {useAuth} from '@/hooks';
import {LinkedinIcon} from 'lucide-react';
import {Link} from 'react-router-dom';
import LavaLamp from '@/components/ui/lava-lamp';
import {Button} from '@magnetic/button';
import CiscoLogo from '@/assets/images/cisco-logo-black.svg?react';
import {useThemeStore} from '@/store';
import {useShallow} from 'zustand/react/shallow';
import {useEffect} from 'react';
import {setTheme} from '@magnetic/theme';

const Welcome = () => {
  const {login, register} = useAuth();

  const {cleanThemeStore} = useThemeStore(useShallow((store) => ({cleanThemeStore: store.cleanThemeStore})));

  useEffect(() => {
    cleanThemeStore();
    setTheme('light');
  }, []);

  return (
    <div className="flex h-screen">
      <div className="hidden md:flex flex-col w-[80%] basis-80%] relative overflow-hidden">
        <div className="absolute inset-0 dark:border-r">
          <LavaLamp />
        </div>
        <div className="relative z-20 flex flex-col justify-between	text-lg font-medium p-10 h-full w-fit">
          <Link to={'https://cisco.com/'} target="_blank" rel="noreferrer">
            <CiscoLogo className="w-36" />
          </Link>
          <div className="relative z-20">
            <ul className="flex flex-wrap items-center mb-6 sm:mb-0">
              <li>
                <p className="me-4 md:me-6 mb-2 text-[1.2rem]">Follow Us</p>
                <ul className="flex flex-wrap items-center mb-6 text-sm sm:mb-0">
                  <li>
                    <a
                      href="https://x.com/cisco"
                      target="_blank"
                      className="hover:underline me-4 md:me-6 pr-2 hover:text-primary me-4 md:me-6"
                      rel="noreferrer"
                    >
                      <svg className="h-5 w-5 fill-current" height="50" viewBox="0 0 1200 1227" width="50" xmlns="http://www.w3.org/2000/svg">
                        <path d="M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.854V687.828Z"></path>
                      </svg>
                    </a>
                  </li>
                  <li>
                    <a href="https://www.linkedin.com/company/cisco" target="_blank" className="me-4 md:me-6 hover:text-primary" rel="noreferrer">
                      <LinkedinIcon />
                    </a>
                  </li>
                </ul>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center justify-between w-full md:w-1/2 md:basis-1/2">
        <div className="p-10">
          <div className="block md:hidden">
            <Link to={'https://cisco.com/'} target="_blank" rel="noreferrer">
              <CiscoLogo className="w-36" />
            </Link>
          </div>
        </div>
        <div className="h-fit flex items-center justify-center w-fit p-10">
          <div className="max-w-[40rem] flex flex-col gap-8">
            <div>
              {/* <img src={""} alt="" className="w-30 h-14 mb-2 -ml-2" /> */}
              <div>{'<LOGO>'}</div>
              <div>
                <h2 className="text-muted-foreground mb-2 text-lg">{'<Title>'}</h2>
                <p className="mb-8">{'Description'}</p>
              </div>
              <div className="w-auto">
                <Button onClick={() => login?.()} className="w-full">
                  <p className="mx-auto">Login</p>
                </Button>
                <p className="text-center mt-[1rem] text-[12px]">
                  {"Don't have an account? "}
                  <span className="hover:underline font-bold italic hover:cursor-pointer" onClick={() => register?.()}>
                    {'Sign Up'}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-none border-none flex items-center justify-center w-full px-14 py-10">
          <span className="block text-sm text-gray-500 sm:text-center text-muted-foreground text-[12px] text-center">
            <a href="https://cisco.com/" className="text-muted-foreground inline-link font-normal" rel="noreferrer" target="_blank">
              Cisco Systems, Inc
            </a>{' '}
            © {`${new Date().getFullYear()}`}. All Rights Reserved.
          </span>
        </div>
      </div>
    </div>
  );
};

export default Welcome;
