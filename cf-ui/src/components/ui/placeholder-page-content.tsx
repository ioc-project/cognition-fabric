'use client';

import {AlertTriangle} from 'lucide-react';
import React from 'react';

export const PlaceholderPageContent: React.FC<{type?: 'placeholder' | 'mock'}> = ({type = 'placeholder'}) => {
  const title = type === 'placeholder' ? 'This page is a placeholder' : 'This page contains mock data';
  const description = type === 'placeholder' ? 'This page has not been implemented yet.' : 'This page contains mock data for development purposes.';

  return (
    <div className="border border-border rounded-md bg-muted/50" style={{paddingTop: 16, paddingBottom: 16}}>
      <div className="flex items-center px-2 text-sm gap-4">
        <AlertTriangle className="w-6 h-6" />
        <div>
          <h3 className="font-semibold pb-1">{title}</h3>
          <p>{description}</p>
        </div>
      </div>
    </div>
  );
};
