import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BarChart3, Headphones, Route, ShieldCheck, Ticket, UsersRound } from "lucide-react";

type EziiTicketLandingPageProps = {
  className?: string;
  /** Primary CTA — e.g. open docs or explain sign-in. */
  onAccessClick?: () => void;
};

const FEATURES = [
  {
    icon: Ticket,
    title: "End-to-end ticketing",
    description:
      "Capture, triage, and resolve requests with threaded conversations, attachments, and a full audit trail.",
  },
  {
    icon: UsersRound,
    title: "Teams & queues",
    description:
      "Organize agents into teams, balance workload across queues, and keep SLAs visible at a glance.",
  },
  {
    icon: Route,
    title: "Smart routing",
    description:
      "Keyword rules, routing policies, and SLA-aware assignment so every ticket reaches the right resolver.",
  },
  {
    icon: BarChart3,
    title: "Analytics & visibility",
    description:
      "Dashboards, history, and operational metrics to improve response times and service quality.",
  },
  {
    icon: Headphones,
    title: "Customer self-service",
    description:
      "Let customers raise and track tickets, browse guides, and stay informed without overloading the queue.",
  },
  {
    icon: ShieldCheck,
    title: "Secure, multi-tenant",
    description:
      "Role-based access, organization isolation, and controls designed for accountable enterprise support.",
  },
] as const;

const STATS = [
  { value: "99.9%", label: "Uptime SLA" },
  { value: "256-bit", label: "Encryption" },
  { value: "24/7", label: "Support" },
  { value: "SOC 2", label: "Compliant" },
] as const;

export function EziiTicketLandingPage({ className, onAccessClick }: EziiTicketLandingPageProps) {
  return (
    <div
      className={cn(
        "min-h-svh bg-gradient-to-b from-slate-50 via-white to-slate-50 text-slate-800 antialiased dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-slate-100",
        className
      )}
    >
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pt-16 lg:px-8">
        <header className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--brand))] text-white shadow-lg shadow-[hsl(var(--brand)/0.35)] ring-1 ring-black/5 dark:ring-white/10">
            <Ticket className="h-7 w-7" strokeWidth={1.75} aria-hidden />
          </div>
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
            Ezii Ticket
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-400">
            Enterprise-grade help desk and ticketing with intelligent routing, SLA management, and
            multi-channel support—built for teams that need clarity, speed, and control.
          </p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500 dark:text-slate-500">
            Streamline service operations with a modern workspace for agents, leads, and customers.
          </p>
          <Button
            type="button"
            size="lg"
            className="mt-8 h-11 rounded-lg bg-[hsl(var(--brand))] px-8 text-base font-semibold text-white shadow-md shadow-[hsl(var(--brand)/0.35)] hover:bg-[hsl(var(--brand)/0.92)] dark:text-white"
            onClick={() => onAccessClick?.()}
          >
            Access your dashboard
          </Button>
        </header>

        <section id="features" className="mt-16 sm:mt-20" aria-labelledby="features-heading">
          <h2 id="features-heading" className="sr-only">
            Product features
          </h2>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <li
                key={title}
                className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-white/10 dark:bg-slate-900/80 dark:hover:shadow-lg dark:hover:shadow-black/20"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--brand)/0.12)] text-[hsl(var(--brand))] dark:bg-[hsl(var(--brand)/0.2)]">
                  <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {description}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="mt-14 rounded-2xl border border-slate-200/80 bg-white p-8 shadow-sm sm:p-10 dark:border-white/10 dark:bg-slate-900/80"
          aria-labelledby="enterprise-heading"
        >
          <div className="text-center">
            <h2
              id="enterprise-heading"
              className="text-xl font-bold text-slate-900 sm:text-2xl dark:text-white"
            >
              Enterprise-ready features
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
              Built for organizations that demand reliability, security, and scalability.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-8 lg:grid-cols-4">
            {STATS.map(({ value, label }) => (
              <div key={label} className="text-center">
                <p className="text-2xl font-bold text-[hsl(var(--brand))] sm:text-3xl">{value}</p>
                <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <p className="mt-12 text-center text-xs text-slate-500 dark:text-slate-500">
          Secure, reliable, and built for the modern support organization.
        </p>
      </div>
    </div>
  );
}
