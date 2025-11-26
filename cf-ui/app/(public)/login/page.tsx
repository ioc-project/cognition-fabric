'use client';

import Image from 'next/image';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {useState} from 'react';
import {signIn, useSession} from 'next-auth/react';

function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        username,
        password,
        callbackUrl: '/',
        redirect: true
      });

      if (result?.error) {
        setError('Invalid username or password');
        setLoading(false);
      }
    } catch (err) {
      setError('An error occurred during login. Please try again.');
      setLoading(false);
      console.error('Login error:', err);
    }
  };

  return (
    <form onSubmit={handleLogin} className="flex w-full flex-col gap-5">
      <div className="relative">
        <Input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          required
          disabled={loading}
          className="h-[32px] w-full rounded-md border-2 border-[#889099] bg-transparent px-[10px] py-[6px] text-[14px] text-[#DDDDDD] placeholder:text-[#889099] transition focus:border-[#889099] focus:outline-none focus-visible:ring-0 disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      <div className="relative">
        <Input
          id="password"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          disabled={loading}
          className="h-[32px] w-full rounded-md border-2 border-[#889099] bg-transparent px-[10px] py-[6px] pr-10 text-[14px] text-[#DDDDDD] placeholder:text-[#889099] transition focus:border-[#889099] focus:outline-none focus-visible:ring-0 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7E868F] transition hover:text-[#889099] focus-visible:outline-none rounded p-0.5"
        >
          {showPassword ? (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
              <path
                fillRule="evenodd"
                d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z"
                clipRule="evenodd"
              />
              <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
            </svg>
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2">
          <p className="text-[13px] text-red-600">{error}</p>
        </div>
      )}

      <Button
        type="submit"
        disabled={loading}
        className="mt-1 flex h-[32px] w-full items-center justify-center rounded-md bg-gradient-to-r from-yellow-300 to-blue-400 border-2 border-[#889099] px-[10px] py-[6px] text-[14px] font-bold text-[#333333] transition hover:from-yellow-400 hover:to-blue-500 focus-visible:outline-none active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
      >
        {loading ? 'Signing in...' : 'Sign In'}
      </Button>
    </form>
  );
}

export default function Login() {
  const {status} = useSession();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (status === 'authenticated') {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500" />
          <p className="text-gray-600">Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full">
      <div className="relative flex min-h-screen w-1/2 flex-col items-center justify-center overflow-hidden">
        <Image src="/login-image.jpg" alt="Login background" fill className="z-0 object-cover" priority />
        <div className="absolute inset-0 z-10 bg-[#00142BB2]" />
        <div className="relative z-20 flex flex-col items-center gap-4">
          <Image src="/outshift-logo.svg" alt="Outshift by Cisco" width={205.33} height={84.49} className="mb-2" />
          <h1 className="font-cisco shadow-cisco mb-2 whitespace-nowrap text-[40px] font-extrabold leading-[100%] tracking-normal text-white">
            Trusted Knowledge Fabric Management
          </h1>
        </div>
      </div>

      <div className="flex min-h-screen w-1/2 flex-col items-center justify-center bg-white px-8">
        <div className="flex w-full max-w-[440px] flex-col items-start">
          <h2 className="font-cisco mb-1 whitespace-nowrap text-[28px] font-bold leading-tight tracking-tight text-[#00142B]">
            Cognitive State Protocol
          </h2>
          <p className="font-cisco mb-8 text-[16px] leading-relaxed font-normal text-gray-600">Access and manage agent knowledge</p>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
