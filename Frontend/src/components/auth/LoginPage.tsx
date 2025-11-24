import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface LoginPageProps {
  onLogin: () => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleMicrosoftLogin = async () => {
    setIsLoading(true);
    // Simulate authentication delay
    setTimeout(() => {
      setIsLoading(false);
      onLogin();
    }, 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-primary/10"></div>
      </div>
      
      {/* Floating Particles */}
      <div className="absolute inset-0">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-primary/20 rounded-full animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${2 + Math.random() * 2}s`
            }}
          />
        ))}
      </div>

      <Card className="w-full max-w-[420px] mx-4 bg-background/95 backdrop-blur-xl border-border/50 shadow-2xl">
        <CardContent className="p-8">
          {/* Logo Section */}
          <div className="text-center mb-8">
            <div className="mb-4">
              <h1 className="text-3xl font-bold text-foreground">
                <span className="font-serif text-primary">Self</span>
                <span className="font-sans">HealingInfra</span>
              </h1>
              <div className="w-16 h-1 bg-gradient-to-r from-primary to-primary/50 mx-auto mt-2 rounded-full"></div>
            </div>
            <p className="text-sm text-muted-foreground font-medium">
              Enterprise Infrastructure Management Platform
            </p>
          </div>

          {/* Microsoft Login Button */}
          <div className="space-y-4">
            <Button
              onClick={handleMicrosoftLogin}
              disabled={isLoading}
              className="w-full h-12 bg-[#0078d4] hover:bg-[#106ebe] text-white font-medium text-base rounded-lg transition-all duration-200 ease-in-out hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Signing in...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <img 
                    src="https://tse2.mm.bing.net/th/id/OIP.PWoq1WvDQDxc_MPv4Jt0GwHaHa?rs=1&pid=ImgDetMain&o=7&rm=3"
                    alt="Microsoft"
                    className="w-6 h-6"
                  />
                  <span>Sign in with Microsoft</span>
                </div>
              )}
            </Button>

            {/* Security Indicator */}
            <div className="flex items-center justify-center space-x-2 text-xs text-muted-foreground">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <span>Enterprise-grade security</span>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-xs text-muted-foreground">
              © 2025 Self Healing Infra Inc. All rights reserved.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}