import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, CheckCircle2, User } from 'lucide-react';
import { useAuthStore } from '../../store/auth-store';

interface AuthFormProps {
  mode: 'login' | 'signup' | 'reset';
  setMode: (m: 'login' | 'signup' | 'reset') => void;
}

export default function AuthForm({ mode, setMode }: AuthFormProps) {
  const { signIn, signUp, resetPassword } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (mode === 'reset') {
        const { error: err } = await resetPassword(email);
        if (err) {
          setError(err);
        } else {
          setResetSent(true);
        }
      } else if (mode === 'login') {
        const { error: err } = await signIn(email, password);
        if (err) setError(err);
      } else {
        const { error: err } = await signUp(email, password);
        if (err) setError(err);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (resetSent) {
    return (
      <div className="flex flex-col items-center py-4 text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Check your email</h3>
        <p className="text-sm text-white/40 mb-6 max-w-[280px]">
          We sent a password reset link to <span className="text-white/70">{email}</span>
        </p>
        <button
          onClick={() => {
            setResetSent(false);
            setMode('login');
          }}
          className="text-sm text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {mode === 'signup' && (
        <InputField
          icon={<User className="w-4 h-4" />}
          type="text"
          placeholder="Full name"
          value={name}
          onChange={setName}
          autoComplete="name"
        />
      )}

      <InputField
        icon={<Mail className="w-4 h-4" />}
        type="email"
        placeholder="Email address"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        required
      />

      {mode !== 'reset' && (
        <div className="relative">
          <InputField
            icon={<Lock className="w-4 h-4" />}
            type={showPassword ? 'text' : 'password'}
            placeholder={mode === 'signup' ? 'Create a password' : 'Password'}
            value={password}
            onChange={setPassword}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
            minLength={6}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 transition-colors"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      )}

      {mode === 'login' && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setMode('reset')}
            className="text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            Forgot password?
          </button>
        </div>
      )}

      {error && (
        <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 text-white font-medium text-sm shadow-lg shadow-cyan-500/15 hover:shadow-cyan-500/25 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
      >
        {submitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            {mode === 'login' && 'Sign in'}
            {mode === 'signup' && 'Create account'}
            {mode === 'reset' && 'Send reset link'}
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
    </form>
  );
}

function InputField({
  icon,
  type,
  placeholder,
  value,
  onChange,
  autoComplete,
  required,
  minLength,
}: {
  icon: React.ReactNode;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <div className="relative group">
      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-cyan-400/60 transition-colors">
        {icon}
      </div>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        className="w-full h-11 pl-10 pr-10 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-cyan-500/40 focus:bg-white/[0.06] focus:ring-1 focus:ring-cyan-500/20 transition-all duration-200"
      />
    </div>
  );
}
