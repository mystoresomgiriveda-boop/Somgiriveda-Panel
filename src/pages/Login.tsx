import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { toast } from 'react-hot-toast';
import { Lock, Mail, Loader2, ChevronRight, LogIn } from 'lucide-react';
import { motion } from 'motion/react';

export default function Login() {
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const isRegistering = false; // Only login for now
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const email = emailOrUsername.includes('@') 
      ? emailOrUsername 
      : `${emailOrUsername.toLowerCase()}@admin.com`;

    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
        toast.success('Account Created Successfully');
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        toast.success('Login Successful');
      }
      navigate('/');
    } catch (error: unknown) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-slate-950 text-white overflow-hidden">
      {/* Decorative Side - Hidden on Mobile */}
      <div className="hidden lg:flex flex-col justify-center p-20 bg-slate-900 border-r border-slate-800 relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 blur-3xl rounded-full -mr-48 -mt-48 transition-all hover:bg-blue-600/20" />
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="flex items-center gap-2 mb-8">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Lock className="text-white" size={20} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Dev Somgiriveda</h1>
          </div>
          <h2 className="text-6xl font-black mb-6 leading-tight">Master your <br /><span className="text-blue-500">Logistics.</span></h2>
          <p className="text-slate-400 text-lg max-w-md">Professional logistics management with real-time OCR scanning and intelligent analytics.</p>
        </motion.div>
      </div>

      {/* Login Form */}
      <div className="flex flex-col justify-center items-center p-6 sm:p-12 relative overflow-hidden">
        {/* Mobile Logo */}
        <div className="lg:hidden flex items-center gap-2 mb-12">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
            <Lock className="text-white" size={16} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Dev Somgiriveda</h1>
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md"
        >
          <div className="mb-8 text-center sm:text-left">
            <h3 className="text-3xl font-bold mb-2">Welcome Back</h3>
            <p className="text-slate-400">Please enter your credentials to login.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="group space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Username or Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={18} />
                <input 
                  type="text" 
                  value={emailOrUsername}
                  onChange={(e) => setEmailOrUsername(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 py-4 pl-12 pr-4 rounded-2xl outline-none transition-all placeholder:text-slate-700" 
                  placeholder={isRegistering ? "admin@example.com" : "admin"}
                  required
                />
              </div>
            </div>

            <div className="group space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={18} />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 py-4 pl-12 pr-4 rounded-2xl outline-none transition-all placeholder:text-slate-700"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button 
              disabled={loading}
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800/50 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 group transition-all mt-8 active:scale-[0.98]"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  <LogIn size={18} />
                  Login
                  <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-10 pt-10 border-t border-slate-900 text-center">
            <p className="text-slate-500 text-sm">Need help? Contact system administrator.</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
