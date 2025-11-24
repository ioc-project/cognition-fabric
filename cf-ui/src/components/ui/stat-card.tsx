import {Card, CardContent, CardDescription, CardHeader} from '@/components/ui/card';

interface StatCardProps {
  label: string;
  value: number | string;
}

export function StatCard({label, value}: StatCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardDescription className="text-xs uppercase tracking-wider">{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold dark:text-white">{value}</div>
      </CardContent>
    </Card>
  );
}
