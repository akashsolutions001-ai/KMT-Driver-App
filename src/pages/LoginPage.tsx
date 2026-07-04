import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InlineMessage } from '@/components/InlineMessage';
import { Bus } from 'lucide-react';

interface LoginPageProps {
  onLogin: (driverId: string, password: string) => void;
  error?: string;
  isLoading?: boolean;
}

export function LoginPage({ onLogin, error, isLoading }: LoginPageProps) {
  const [driverId, setDriverId] = useState('');
  const [password, setPassword] = useState('');

  const isFormValid = driverId.trim() !== '' && password.trim() !== '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isFormValid && !isLoading) {
      onLogin(driverId, password);
    }
  };

  return (
    <div className="min-h-screen-safe bg-background flex flex-col items-center justify-center p-4 sm:p-6 safe-area-inset-top safe-area-inset-bottom">
      <div className="w-full max-w-sm">
        {/* Logo / Title */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-primary mb-3 sm:mb-4 shadow-lg shadow-primary/30">
            <Bus className="w-7 h-7 sm:w-8 sm:h-8 text-primary-foreground" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Driver App</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">Sign in to start your route</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="bg-card rounded-xl border border-border p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-sm">
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="driverId" className="text-foreground font-medium text-sm">
              Driver ID
            </Label>
            <Input
              id="driverId"
              type="text"
              placeholder="Enter your driver ID"
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className="h-11 sm:h-12 text-base"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="password" className="text-foreground font-medium text-sm">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 sm:h-12 text-base"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <InlineMessage type="error" message={error} />
          )}

          <Button
            type="submit"
            className="w-full h-11 sm:h-12 text-base font-semibold mt-2 active:scale-[0.98] transition-transform"
            disabled={!isFormValid || isLoading}
          >
            {isLoading ? 'Signing in...' : 'LOGIN'}
          </Button>
        </form>

        {/* App Version - Optional footer */}
        <p className="text-center text-xs text-muted-foreground/60 mt-4 sm:mt-6">
          Route Master Driver v1.0
        </p>
      </div>
    </div>
  );
}
