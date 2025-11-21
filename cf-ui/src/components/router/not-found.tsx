'use client';

import {Button} from '@/components/ui/button';
import {AlertTriangle} from 'lucide-react';
import {useRouter} from 'next/navigation';
import React from 'react';

const NotFound: React.FC = () => {
  const router = useRouter();

  const handleClick = (e: {preventDefault: () => void}) => {
    e.preventDefault();
    router.back();
  };

  return (
    <div className="border rounded-lg p-6">
      <div className="flex flex-col gap-2 items-center justify-center">
        <div>
          <div className="p-3 inline-flex items-center align-center rounded-full">
            <AlertTriangle className="w-10 h-10" />
          </div>
        </div>
        <h1 className="font-bold">404: Page not found</h1>
        <p>Sorry, we can&apos;t find the page you&apos;re looking for. It might have been removed or renamed, or maybe it never existed.</p>
        <Button onClick={handleClick} className="mt-3">
          Go Back
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
