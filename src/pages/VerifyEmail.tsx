import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2, Mail } from 'lucide-react';

const VerifyEmail: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');
  const successParam = params.get('success');
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'no-token'>(token ? 'loading' : successParam ? 'success' : 'no-token');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (r.ok) { setStatus('success'); setMessage(data.message || 'Email verified successfully'); }
        else { setStatus('error'); setMessage(data.error || 'Invalid or expired token'); }
      })
      .catch(() => { setStatus('error'); setMessage('Network error'); });
  }, [token]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 shadow-sm text-center">
        {status === 'loading' && <><Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" /><p className="text-sm text-muted-foreground">Verifying your email...</p></>}
        {status === 'success' && <><CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-4" /><h1 className="text-lg font-bold text-foreground mb-2">Email verified</h1><p className="text-sm text-muted-foreground mb-6">{message || 'Your email has been verified. You can now sign in.'}</p><button onClick={() => navigate('/')} className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium">Go to app</button></>}
        {status === 'error' && <><XCircle className="w-10 h-10 text-destructive mx-auto mb-4" /><h1 className="text-lg font-bold text-foreground mb-2">Verification failed</h1><p className="text-sm text-muted-foreground mb-6">{message}</p><Link to="/" className="inline-block w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium text-center">Back to home</Link></>}
        {status === 'no-token' && <><Mail className="w-10 h-10 text-primary mx-auto mb-4" /><h1 className="text-lg font-bold text-foreground mb-2">Check your email</h1><p className="text-sm text-muted-foreground mb-6">We've sent a verification link to your email. Click the link to verify your address. The link expires in 24 hours.</p><Link to="/" className="inline-block w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium text-center">Back to home</Link></>}
      </div>
    </div>
  );
};

export default VerifyEmail;
