// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

'use client';

import * as React from 'react';
import {DayPicker, DateRange} from 'react-day-picker';

interface DateRangePickerProps {
  value?: DateRange;
  onChange?: (range: DateRange | undefined) => void;
}

export function DateRangePicker({value, onChange}: DateRangePickerProps) {
  const [range, setRange] = React.useState<DateRange | undefined>(value);

  const handleSelect = (r: DateRange | undefined) => {
    setRange(r);
    onChange?.(r);
  };

  return (
    <div className="p-2 mds-day-picker">
      <DayPicker mode="range" selected={range} onSelect={handleSelect} showWeekNumber={false} />
    </div>
  );
}
