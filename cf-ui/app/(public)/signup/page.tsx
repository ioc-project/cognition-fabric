// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import Image from 'next/image';
import Link from 'next/link';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Loader} from '@/components/ui/loader';
import {useState} from 'react';
import {signIn, useSession} from 'next-auth/react';
import {authApi} from '@/api/endpoints/auth';
import {SignupRequestSchema} from '@/api/types/auth';
import {z} from 'zod';

function SignupForm() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setLoading(true);

    try {
      const validatedData = SignupRequestSchema.parse({
        username,
        email,
        password
      });

      await authApi.signup({
        ...validatedData,
        domain: 'ioc.local',
        role: 'admin'
      });

      const result = await signIn('credentials', {
        username: validatedData.username,
        password: validatedData.password,
        redirect: false
      });

      if (result?.ok) {
        window.location.href = '/workspaces';
      } else {
        setError('Account created but login failed. Please try logging in manually.');
        setLoading(false);
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        err.errors.forEach((error) => {
          if (error.path[0]) {
            errors[error.path[0].toString()] = error.message;
          }
        });
        setFieldErrors(errors);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred during signup. Please try again.');
      }
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSignup} className="flex w-full flex-col gap-5">
      <div className="relative">
        <Input
          id="username"
          type="text"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setFieldErrors((prev) => ({...prev, username: ''}));
          }}
          placeholder="Username"
          autoComplete="off"
          required
          disabled={loading}
          className="h-[32px] w-full rounded-md border-2 border-neutral-border bg-transparent px-[10px] py-[6px] text-[14px] text-neutral-faint placeholder:text-neutral-border transition focus:border-neutral-border focus:outline-none focus-visible:ring-0 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {fieldErrors.username && <p className="mt-1 text-xs text-red-600">{fieldErrors.username}</p>}
      </div>

      <div className="relative">
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setFieldErrors((prev) => ({...prev, email: ''}));
          }}
          placeholder="Email"
          autoComplete="off"
          required
          disabled={loading}
          className="h-[32px] w-full rounded-md border-2 border-neutral-border bg-transparent px-[10px] py-[6px] text-[14px] text-neutral-faint placeholder:text-neutral-border transition focus:border-neutral-border focus:outline-none focus-visible:ring-0 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}
      </div>

      <div className="relative">
        <Input
          id="password"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setFieldErrors((prev) => ({...prev, password: ''}));
          }}
          placeholder="Password"
          autoComplete="new-password"
          required
          disabled={loading}
          className="h-[32px] w-full rounded-md border-2 border-neutral-border bg-transparent px-[10px] py-[6px] pr-10 text-[14px] text-neutral-faint placeholder:text-neutral-border transition focus:border-neutral-border focus:outline-none focus-visible:ring-0 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-border transition hover:text-neutral-border focus-visible:outline-none rounded p-1 flex items-center justify-center"
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
        {fieldErrors.password && <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2">
          <p className="text-[13px] text-red-600">{error}</p>
        </div>
      )}

      <Button
        type="submit"
        disabled={loading}
        className="mt-1 flex h-[32px] w-full items-center justify-center rounded-md bg-gradient-to-r from-yellow-300 to-blue-400 border-2 border-neutral-border px-[10px] py-[6px] text-[14px] font-bold text-neutral-strong transition hover:from-yellow-400 hover:to-blue-500 focus-visible:outline-none active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
      >
        {loading ? 'Creating account...' : 'Sign Up'}
      </Button>

      <div className="text-center">
        <p className="text-[13px] text-gray-600">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-700 transition">
            Sign In
          </Link>
        </p>
      </div>
    </form>
  );
}

export default function Signup() {
  const {status} = useSession();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-white">
        <Loader size="lg" />
      </div>
    );
  }

  if (status === 'authenticated') {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-white">
        <Loader size="lg" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full">
      <div className="relative flex min-h-screen w-1/2 flex-col items-center justify-center overflow-hidden">
        <Image src="/login-image.jpg" alt="Signup background" fill className="z-0 object-cover" priority />
        <div className="absolute inset-0 z-10 bg-[#00142BB2]" />
        <div className="relative z-20 flex flex-col items-center gap-4">
          <Image src="/outshift-logo.png" alt="Outshift by Cisco" width={205} height={84} className="mb-2" />
        </div>
      </div>

      <div className="relative flex min-h-screen w-1/2 flex-col items-center justify-center bg-white px-8">
        <div className="relative z-10 flex w-full max-w-[600px] flex-col items-start">
          <h2 className="font-cisco mb-1 text-[28px] font-bold leading-tight tracking-tight text-neutral-alt">Create Account</h2>
          <p className="font-cisco mb-8 text-[16px] leading-relaxed font-normal text-gray-600 whitespace-nowrap">
            Get started with Cognition Fabric Node
          </p>
          <SignupForm />
        </div>
      </div>
    </div>
  );
}
