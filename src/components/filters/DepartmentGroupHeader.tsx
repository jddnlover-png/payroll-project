import * as React from 'react';
import { ChevronDown, ChevronRight, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TableRow, TableCell } from '@/components/ui/table';

interface DepartmentGroupHeaderProps {
  department: string;
  count: number;
  summary?: string;
  isExpanded: boolean;
  onToggle: () => void;
  colSpan: number;
}

export const DepartmentGroupHeader = React.forwardRef<
  HTMLTableRowElement,
  DepartmentGroupHeaderProps
>(({ department, count, summary, isExpanded, onToggle, colSpan }, ref) => {
  return (
    <TableRow
      ref={ref}
      className="bg-muted/70 hover:bg-muted cursor-pointer select-none"
      onClick={onToggle}
    >
      <TableCell colSpan={colSpan} className="py-2 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-sm">{department}</span>
            <span className="text-xs text-muted-foreground">({count}명)</span>
          </div>
          {summary && (
            <span className="text-xs text-muted-foreground font-medium">{summary}</span>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
});

DepartmentGroupHeader.displayName = 'DepartmentGroupHeader';
