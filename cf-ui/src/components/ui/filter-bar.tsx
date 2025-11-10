import React, {forwardRef, useMemo, useState, useImperativeHandle, createRef} from 'react';
import {Button} from '@magnetic/button';
import {Drawer} from '@magnetic/drawer';
import {FilterBar as FilterBarMagnetic, type FilterBarProps as FilterBarPropsMagnetic} from '@magnetic/filter-bar';
import {Flex} from '@magnetic/flex';
import {Select, useMultiSelectValue} from '@magnetic/select';
import {Text} from '@magnetic/text';
import {Search} from '@magnetic/search';
import {Divider} from '@magnetic/divider';
import {FunnelSimple} from '@magnetic/icons';
import {FitlerType} from '@/types/filter';

// eslint-disable-next-line react/display-name
const SelectFilter = forwardRef(({label, filterKey, options, size, selectedOptions, onClearFilter, onFilterChange}: SelectFilterProps, ref) => {
  const {onChange, onClear, value} = useMultiSelectValue(selectedOptions);

  const handleClear = () => {
    onClear();
    onClearFilter?.(filterKey);
  };

  const handleChange = (value: string[], options: string, action: 'add' | 'remove') => {
    onChange(value, options, action);
    onFilterChange?.(filterKey, options, action);
  };

  useImperativeHandle(ref, () => ({
    clearFilter: () => {
      onClear();
    }
  }));

  return (
    <Select.MultiSelect
      label={label}
      menuWidth="auto"
      onChange={handleChange}
      onClear={handleClear}
      options={options}
      placeholder={label}
      size={size}
      value={value}
    />
  );
});

interface SelectFilterProps {
  filterKey: string;
  label: string;
  options: {value: string; label: string}[];
  size: 'md' | 'sm';
  selectedOptions?: string[];
  onFilterChange?: (filterKey: string, options: string, action: 'add' | 'remove') => void;
  onClearFilter?: (filterKey: string) => void;
}

export const FilterBar = (args: FilterBarProps) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [filters, setFilters] = useState(args.selections.map((select) => ({filterKey: select.filterKey, options: new Set<string>()})));
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  const selectRefs = useMemo(
    () =>
      Array(args.selections.length)
        .fill(0)
        .map((_) => createRef<{clearFilter: () => void}>()),
    [args.selections.length]
  );

  const showReset = useMemo(() => {
    return filters.some((filter) => filter.options.size > 0);
  }, [filters]);

  const SearchBar = (
    <Search
      fixedWidth
      label="filter-search"
      placeholder="Search"
      size={args.size}
      value={searchKeyword}
      onChange={(e) => {
        setSearchKeyword(e.target.value);
        args.onChangeSearch?.(e.target.value);
      }}
    />
  );

  const handleClear = () => {
    filters.forEach((filter) => filter.options.clear());
    setFilters([...filters]);
    args.onFiltersChange?.(filters);
    selectRefs.forEach((selectRef) => {
      selectRef.current?.clearFilter();
    });
  };

  const openDrawer = () => {
    setIsDrawerOpen(true);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
  };

  const handleFilterChange = (filterKey: string, options: string, action: 'add' | 'remove') => {
    const findFilter = filters.find((filter) => filter.filterKey === filterKey);
    if (action === 'add' && findFilter?.filterKey) {
      findFilter.options.add(options);
      setFilters([...filters]);
      args.onFiltersChange?.(filters);
    } else if (action === 'remove' && findFilter?.filterKey) {
      findFilter.options.delete(options);
      setFilters([...filters]);
      args.onFiltersChange?.(filters);
    }
  };

  const handleClearFilter = (filterKey: string) => {
    const findFilter = filters.find((filter) => filter.filterKey === filterKey);
    if (findFilter) {
      findFilter.options.clear();
      setFilters([...filters]);
      args.onFiltersChange?.(filters);
    }
  };

  if (args.useDrawer) {
    return (
      <div className="w-full min-w-[100px]">
        <FilterBarMagnetic onReset={handleClear} searchBar={SearchBar} showResetButton={showReset} {...args}>
          <div className="flex gap-4">
            <Button icon={<FunnelSimple />} kind="tertiary" onClick={openDrawer} size={args.size}>
              Filters
            </Button>
          </div>
        </FilterBarMagnetic>
        <Drawer isOpen={isDrawerOpen} onClose={closeDrawer}>
          <Flex direction="vertical" gap={4}>
            <Drawer.Heading>Filters</Drawer.Heading>
            <Text color="light">Optional descriptor goes here.</Text>
          </Flex>
          <Drawer.Content>
            {args.selections.map((select, index) => (
              <React.Fragment key={select.label}>
                <Flex direction="vertical" gap={4} key={select.label}>
                  <Text weight="bold">{select.label}</Text>
                  <SelectFilter
                    key={select.filterKey}
                    filterKey={select.filterKey}
                    label={select.label}
                    options={select.options}
                    size={args.size || 'md'}
                    selectedOptions={Array.from(filters.find((filter) => filter.filterKey === select.filterKey)?.options || [])}
                    onFilterChange={handleFilterChange}
                    onClearFilter={handleClearFilter}
                    ref={selectRefs[index]}
                  />
                </Flex>
                <Divider />
              </React.Fragment>
            ))}
          </Drawer.Content>
          <Drawer.Footer>
            <Button.Group>
              <Button kind="tertiary" onClick={closeDrawer}>
                Close
              </Button>
            </Button.Group>
          </Drawer.Footer>
        </Drawer>
      </div>
    );
  }

  return (
    <div className="w-full min-w-[900px]">
      <FilterBarMagnetic onReset={handleClear} results={1000} searchBar={SearchBar} showResetButton={showReset} {...args}>
        {args.selections.map((select, index) => (
          <SelectFilter
            key={select.filterKey}
            filterKey={select.filterKey}
            label={select.label}
            options={select.options}
            size={args.size || 'md'}
            onFilterChange={handleFilterChange}
            onClearFilter={handleClearFilter}
            ref={selectRefs[index]}
          />
        ))}
      </FilterBarMagnetic>
    </div>
  );
};

interface FilterBarProps extends Omit<FilterBarPropsMagnetic, 'children'> {
  selections: {label: string; filterKey: string; options: {value: string; label: string}[]}[];
  useDrawer?: boolean;
  onFiltersChange?: (filters: FitlerType[]) => void;
  onChangeSearch?: (searchKeyword: string) => void;
}
