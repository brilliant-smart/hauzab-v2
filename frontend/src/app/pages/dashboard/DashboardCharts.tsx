import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, CalendarClock, RefreshCw } from "lucide-react";
import { useDashboardCharts } from "@/app/api/dashboard";
import { AttentionItem } from "@/app/api/types";
import { formatCurrency, formatDate, formatNumber } from "@/app/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const salesConfig = {
  total: { label: "Revenue", color: "var(--chart-1)" },
} satisfies ChartConfig;

const topConfig = {
  quantity: { label: "Units sold", color: "var(--chart-2)" },
} satisfies ChartConfig;

const PAYMENT_COLORS: Record<string, string> = {
  cash: "var(--chart-1)",
  pos: "var(--chart-2)",
  transfer: "var(--chart-3)",
};

const paymentConfig = {
  cash: { label: "Cash", color: "var(--chart-1)" },
  pos: { label: "POS", color: "var(--chart-2)" },
  transfer: { label: "Transfer", color: "var(--chart-3)" },
} satisfies ChartConfig;

function compactNaira(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `₦${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `₦${Math.round(v / 1_000)}k`;
  return `₦${v}`;
}

function truncate(value: string, max = 18): string {
  if (!value) return "";
  return value.length > max ? value.slice(0, max - 1) + "…" : value;
}

function daysLabel(days: number): string {
  return `Last ${days} days`;
}

function SalesTrendSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[260px] w-full" />
      </CardContent>
    </Card>
  );
}

function ChartsError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="col-span-full">
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-muted-foreground">Couldn't load chart data.</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-2 size-4" /> Try again
        </Button>
      </CardContent>
    </Card>
  );
}

function SalesTrendChart({ data }: { data: { label: string; total: number; count: number }[] }) {
  return (
    <Card className="lg:col-span-8">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Sales trend</CardTitle>
        <p className="text-xs text-muted-foreground">{daysLabel(30)} · revenue per day</p>
      </CardHeader>
      <CardContent>
        <ChartContainer config={salesConfig} className="h-[260px] w-full">
          <AreaChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="fillSales" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={28}
              fontSize={11}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={48}
              fontSize={11}
              tickFormatter={(v: number) => compactNaira(v)}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="dot"
                  formatter={(value) => (
                    <div className="flex flex-1 items-center justify-between leading-none">
                      <span className="text-muted-foreground">Revenue</span>
                      <span className="font-mono font-medium tabular-nums text-foreground">
                        {formatCurrency(Number(value))}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Area
              dataKey="total"
              type="monotone"
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="url(#fillSales)"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function PaymentMixChart({ data }: { data: { method: string; label: string; total: number }[] }) {
  const total = data.reduce((sum, d) => sum + d.total, 0);
  return (
    <Card className="lg:col-span-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Payment mix</CardTitle>
        <p className="text-xs text-muted-foreground">{daysLabel(30)} · by tender</p>
      </CardHeader>
      <CardContent>
        <div className="relative mx-auto h-[180px] w-full max-w-[180px]">
          <ChartContainer config={paymentConfig} className="h-full w-full">
            <PieChart>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    nameKey="label"
                    hideLabel
                    formatter={(value) => (
                      <div className="flex flex-1 items-center justify-between leading-none">
                        <span className="text-muted-foreground">Amount</span>
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {formatCurrency(Number(value))}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Pie
                data={data}
                dataKey="total"
                nameKey="label"
                innerRadius={50}
                outerRadius={80}
                strokeWidth={2}
              >
                {data.map((d) => (
                  <Cell key={d.method} fill={PAYMENT_COLORS[d.method] ?? "var(--chart-5)"} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[11px] text-muted-foreground">Total</span>
            <span className="text-base font-semibold tabular-nums">{compactNaira(total)}</span>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {data.map((d) => (
            <div key={d.method} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-[2px]"
                  style={{ background: PAYMENT_COLORS[d.method] ?? "var(--chart-5)" }}
                />
                {d.label}
              </span>
              <span className="font-medium tabular-nums">{formatCurrency(d.total)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TopProductsChart({
  data,
}: {
  data: { name: string; quantity: number; revenue: number }[];
}) {
  return (
    <Card className="lg:col-span-5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Top sellers</CardTitle>
        <p className="text-xs text-muted-foreground">{daysLabel(30)} · units moved</p>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">No sales in this period.</p>
        ) : (
          <ChartContainer config={topConfig} className="h-[260px] w-full">
            <BarChart layout="vertical" data={data} margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                fontSize={11}
                tickFormatter={(v: string) => truncate(v)}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    indicator="dot"
                    nameKey="quantity"
                    formatter={(value, _name, item) => {
                      const p = (item?.payload ?? {}) as { revenue?: number };
                      return (
                        <div className="flex flex-1 items-center justify-between gap-3 leading-none">
                          <span className="text-muted-foreground">Units sold</span>
                          <span className="font-mono font-medium tabular-nums text-foreground">
                            {formatNumber(Number(value))} · {formatCurrency(p.revenue ?? 0)}
                          </span>
                        </div>
                      );
                    }}
                  />
                }
              />
              <Bar dataKey="quantity" fill="var(--chart-2)" radius={[0, 4, 4, 0]} barSize={22} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function AttentionRow({
  to,
  name,
  meta,
  tone,
}: {
  to: string;
  name: string;
  meta: string;
  tone: "danger" | "warning";
}) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-2 rounded-md px-2 py-2 transition-colors hover:bg-accent/50"
    >
      <span className="min-w-0 truncate text-sm font-medium">{name}</span>
      <span
        className={
          tone === "danger"
            ? "shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
            : "shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning"
        }
      >
        {meta}
      </span>
    </Link>
  );
}

function NeedsAttention({
  lowStock,
  expiring,
}: {
  lowStock: AttentionItem[];
  expiring: AttentionItem[];
}) {
  return (
    <Card className="lg:col-span-7">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Needs attention</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2">
        <section>
          <h4 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <AlertTriangle className="size-3.5 text-warning" /> Low stock
          </h4>
          {lowStock.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">Nothing below reorder level.</p>
          ) : (
            <div className="space-y-0.5">
              {lowStock.map((p) => (
                <AttentionRow
                  key={p.id}
                  to={`/products/${p.id}/edit`}
                  name={p.name}
                  meta={`${formatNumber(p.quantity)} / ${formatNumber(p.reorder_level ?? 0)}`}
                  tone="danger"
                />
              ))}
            </div>
          )}
        </section>
        <section>
          <h4 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CalendarClock className="size-3.5 text-destructive" /> Expiring soon
          </h4>
          {expiring.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">Nothing expiring within 90 days.</p>
          ) : (
            <div className="space-y-0.5">
              {expiring.map((p) => (
                <AttentionRow
                  key={p.id}
                  to={`/products/${p.id}/edit`}
                  name={p.name}
                  meta={formatDate(p.expire_date)}
                  tone="warning"
                />
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

export function DashboardCharts() {
  const { data, isLoading, isError, refetch } = useDashboardCharts();

  if (isError) {
    return (
      <div className="grid gap-4 lg:grid-cols-12">
        <ChartsError onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="grid gap-4 lg:grid-cols-12">
        <SalesTrendSkeleton />
        <Card className="lg:col-span-4">
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="mx-auto h-[180px] w-[180px] rounded-full" />
          </CardContent>
        </Card>
        <Card className="lg:col-span-5">
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[260px] w-full" />
          </CardContent>
        </Card>
        <Card className="lg:col-span-7">
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[220px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const salesData = data.sales_trend.map((p) => ({
    label: p.label,
    total: Number(p.total),
    count: p.count,
  }));
  const paymentData = data.payment_mix.map((p) => ({
    method: p.method,
    label: p.label,
    total: Number(p.total),
  }));
  const topData = data.top_products.map((p) => ({
    name: p.name,
    quantity: Number(p.quantity),
    revenue: Number(p.revenue),
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <SalesTrendChart data={salesData} />
      <PaymentMixChart data={paymentData} />
      <TopProductsChart data={topData} />
      <NeedsAttention lowStock={data.low_stock} expiring={data.expiring} />
    </div>
  );
}