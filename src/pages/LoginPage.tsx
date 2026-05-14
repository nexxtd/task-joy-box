import React, { useState, useEffect } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { useAuth } from '@/context/AuthContext';
import { Eye, EyeOff, Sparkles, ArrowLeft, CheckCircle } from 'lucide-react';

type Mode = 'login' | 'signup' | 'forgot' | 'reset';

interface Props {
  initialToken?: string;
}

// Get Google Client ID from environment or use a placeholder
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID_HERE';

const LoginPage: React.FC<Props> = ({ initialToken }) => {
  const { login, signup, loginWithGoogle, forgotPassword, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>(initialToken ? 'reset' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetToken, setResetToken] = useState(initialToken || '');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setError('');
    setSuccess('');
  }, [mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else if (mode === 'signup') {
        if (password !== confirmPassword) throw new Error('Passwords do not match');
        await signup(name, email, password);
      } else if (mode === 'forgot') {
        const res = await forgotPassword(email);
        setSuccess(res.message || 'Check your email for a reset link.');
        if (res.resetToken) {
          setResetToken(res.resetToken);
          setSuccess(`Reset link generated. Click here to reset your password.`);
        }
      } else if (mode === 'reset') {
        if (password !== confirmPassword) throw new Error('Passwords do not match');
        await resetPassword(resetToken, password);
        setSuccess('Password reset successfully! You can now log in.');
        setTimeout(() => setMode('login'), 2000);
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: any) => {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle(credentialResponse.credential);
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  // Show a warning if Google Client ID is not configured
  if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) {
    console.warn('Google Client ID is not configured. Please set VITE_GOOGLE_CLIENT_ID in your .env file.');
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary mb-4">
              <Sparkles className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">MyPlanner</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === 'login' && 'Welcome back'}
              {mode === 'signup' && 'Create your account'}
              {mode === 'forgot' && 'Reset your password'}
              {mode === 'reset' && 'Choose a new password'}
            </p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
            {/* Back button for forgot/reset */}
            {(mode === 'forgot' || mode === 'reset') && (
              <button
                onClick={() => setMode('login')}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Back to login
              </button>
            )}

            {/* Success message */}
            {success && (
              <div className="flex items-start gap-3 p-3 bg-label-green/10 border border-label-green/20 rounded-lg mb-5">
                <CheckCircle className="w-4 h-4 text-label-green flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-foreground">{success}</p>
                  {resetToken && mode === 'forgot' && (
                    <button
                      onClick={() => setMode('reset')}
                      className="text-xs text-primary underline mt-1"
                    >
                      Click here to enter your new password
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg mb-5">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name (signup only) */}
              {mode === 'signup' && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Your name"
                    required
                    className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    data-testid="input-name"
                  />
                </div>
              )}

              {/* Email */}
              {mode !== 'reset' && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    data-testid="input-email"
                  />
                </div>
              )}

              {/* Password */}
              {(mode === 'login' || mode === 'signup' || mode === 'reset') && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">
                    {mode === 'reset' ? 'New Password' : 'Password'}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={8}
                      className="w-full px-3 py-2.5 pr-10 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                      data-testid="input-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Confirm password */}
              {(mode === 'signup' || mode === 'reset') && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">Confirm Password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    data-testid="input-confirm-password"
                  />
                </div>
              )}

              {/* Forgot password link */}
              {mode === 'login' && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    className="text-xs text-primary hover:underline"
                    data-testid="link-forgot-password"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="button-submit"
              >
                {loading ? 'Please wait...' : (
                  mode === 'login' ? 'Sign In' :
                  mode === 'signup' ? 'Create Account' :
                  mode === 'forgot' ? 'Send Reset Link' :
                  'Reset Password'
                )}
              </button>
            </form>

            {/* Google OAuth - only on login/signup */}
            {(mode === 'login' || mode === 'signup') && (
              <>
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="px-3 bg-card text-xs text-muted-foreground">or continue with</span>
                  </div>
                </div>
                <div className="flex justify-center">
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => setError('Google sign-in failed')}
                    useOneTap={false}
                    theme="outline"
                    size="large"
                    width="360"
                  />
                </div>
              </>
            )}

            {/* Toggle login/signup */}
            {(mode === 'login' || mode === 'signup') && (
              <p className="text-center text-xs text-muted-foreground mt-5">
                {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                <button
                  onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                  className="text-primary hover:underline font-medium"
                  data-testid="link-toggle-mode"
                >
                  {mode === 'login' ? 'Sign up' : 'Sign in'}
                </button>
              </p>
            )}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-4">
            Secure · Private · No spam
          </p>
        </div>
      </div>
    </GoogleOAuthProvider>
  );
};

export default LoginPage;