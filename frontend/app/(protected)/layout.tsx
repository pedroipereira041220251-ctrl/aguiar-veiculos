import Nav from '@/components/Nav';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Nav />
      <main className="flex-1 min-w-0 main-safe-pb overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
